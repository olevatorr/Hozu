// ADR 0045 phase 0 and 3: node --import ./packages/transform/dist/register.js bench/ui/baseline.ts [--out <dir>]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { planRoute } from '@hozu/compiler'
import type { Diagnostic, ProjectIR, ValueExpr, ViewNode } from '@hozu/core/ir'
import { buildProject, canonicalStringify, parsePointer } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { exclusive, validate } from '@hozu/validator'

const root = fileURLToPath(new URL('../../', import.meta.url))
const flag = process.argv.indexOf('--out')
const out = flag < 0 ? join(root, 'bench/ui/baseline-0.8') : resolve(process.argv[flag + 1] ?? '')
const req = createRequire(join(root, 'packages/css/package.json'))
const tailwind = (await import(pathToFileURL(req.resolve('@tailwindcss/node')).href)) as {
  compile: (css: string, o: object) => Promise<{ build: (candidates: string[]) => string }>
}
const resolveCss = async (id: string) =>
  id === 'tailwindcss' || id.startsWith('tailwindcss/')
    ? req.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
    : undefined

const projects = [
  ...readdirSync(join(root, 'examples'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join('examples', d.name)),
  'site',
].filter((dir) => {
  try {
    return readFileSync(join(root, dir, 'hozu.config.ts')).length > 0
  } catch {
    return false
  }
})

const clientSeen = new Set<string>()
function clientBytes(file: string): number {
  if (clientSeen.has(file)) return 0
  clientSeen.add(file)
  const code = readFileSync(join(root, 'packages/runtime-client/dist/browser', file), 'utf8')
  const deps = [...code.matchAll(/from"\.\/(chunk-[A-Z0-9]+\.js)"/g)].map((m) => m[1]!)
  return gzipSync(code).length + deps.reduce((sum, d) => sum + clientBytes(d), 0)
}

function walk(node: ViewNode, visit: (n: ViewNode) => void) {
  visit(node)
  switch (node.kind) {
    case 'el':
    case 'widget':
    case 'when':
      node.children.forEach((c) => walk(c, visit))
      return
    case 'if':
      node.ifTrue.forEach((c) => walk(c, visit))
      node.ifFalse.forEach((c) => walk(c, visit))
      return
    case 'each':
      walk(node.item, visit)
      return
    case 'query':
      walk(node.ready, visit)
      if (node.pending) walk(node.pending, visit)
      Object.values(node.failed).forEach((c) => walk(c, visit))
      return
    default:
      return
  }
}

const viewRoot = (ir: ProjectIR, id: string) => {
  const [feature, view] = id.split('.') as [string, string]
  return ir.features[feature]?.views[view]?.root ?? null
}

function routeSummary(ir: ProjectIR) {
  const routes: Record<string, { js: string; islands: number; widgets: string[] }> = {}
  for (const route of Object.keys(ir.pages).sort()) {
    const { plan } = planRoute(ir, route)
    const widgets = new Set<string>()
    for (const id of ir.pages[route]!.views) {
      const r = viewRoot(ir, id)
      if (r) walk(r, (n) => n.kind === 'widget' && widgets.add(n.widget))
    }
    routes[route] = { js: String(plan.js), islands: plan.islands.length, widgets: [...widgets].sort() }
  }
  return routes
}

const variantOf = (c: string) => {
  let depth = 0
  let cut = -1
  for (let i = 0; i < c.length; i++) {
    if (c[i] === '[' || c[i] === '(') depth++
    else if (c[i] === ']' || c[i] === ')') depth--
    else if (c[i] === ':' && depth === 0) cut = i
  }
  return cut < 0 ? '' : c.slice(0, cut + 1)
}

const declarations = (css: string) => {
  const props = new Map<string, string>()
  const body = css.replace(/@property[^{]*\{[^}]*\}/g, '')
  for (const m of body.matchAll(/([-\w]+)\s*:\s*([^;{}]+);/g)) props.set(m[1]!, m[2]!.trim())
  return props
}

const utilities = (css: string) => {
  const at = css.indexOf('@layer utilities {')
  if (at < 0) return ''
  let depth = 0
  for (let i = at; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  return css.slice(at)
}

interface Conflict {
  project: string
  node: string
  kind: 'class-class' | 'class-toggle' | 'toggle-toggle'
  a: string
  b: string
  properties: string[]
  guards: string[]
}

const guardText = (g: ValueExpr) => JSON.stringify(g).slice(0, 160)

async function conflicts(
  name: string,
  dir: string,
  build: ReturnType<typeof buildProject>,
): Promise<Conflict[]> {
  const { entry, features } = build.bindings.styles
  const source = [entry ?? 'tailwindcss', ...Object.values(features).flat()]
    .map((file) => `@import ${JSON.stringify(file)};`)
    .join('\n')
  const options = { base: join(root, dir), customCssResolver: resolveCss, onDependency: () => {} }
  const cache = new Map<string, Map<string, string>>()
  const pending = new Set<string>()
  for (const feature of Object.values(build.ir.features))
    for (const view of Object.values(feature.views))
      walk(view.root, (n) => {
        if (n.kind !== 'el' && n.kind !== 'widget') return
        for (const c of [n.class ?? '', ...Object.keys(n.toggle)].join(' ').split(/\s+/))
          if (c) pending.add(c)
      })
  for (const c of pending) {
    const css = utilities((await tailwind.compile(source, options)).build([c]))
    cache.set(c, new Map([...declarations(css)].filter(([p]) => !p.startsWith('--'))))
  }
  const props = (c: string) => cache.get(c) ?? new Map<string, string>()
  const found: Conflict[] = []
  const check = (node: string, a: [string, string | null], b: [string, string | null], toggles: ViewNode) => {
    const [ca, ga] = a
    const [cb, gb] = b
    if (ca === cb || variantOf(ca) !== variantOf(cb)) return
    if (ca.endsWith('!') !== cb.endsWith('!')) return
    const pa = props(ca)
    const pb = props(cb)
    if (pa.size === 0 || pa.size !== pb.size) return
    if (![...pa.keys()].every((p) => pb.has(p))) return
    const differ = [...pa].filter(([p, v]) => pb.get(p) !== v).map(([p]) => p)
    if (differ.length === 0) return
    const kind =
      ga === null && gb === null
        ? 'class-class'
        : ga === null || gb === null
          ? 'class-toggle'
          : 'toggle-toggle'
    const el = toggles.kind === 'el' || toggles.kind === 'widget' ? toggles : null
    found.push({
      project: name,
      node,
      kind,
      a: ca,
      b: cb,
      properties: differ.sort(),
      guards: [ga, gb].filter((g): g is string => g !== null).map((k) => guardText(el!.toggle[k]!)),
    })
  }
  for (const feature of Object.values(build.ir.features))
    for (const view of Object.values(feature.views))
      walk(view.root, (n) => {
        if (n.kind !== 'el' && n.kind !== 'widget') return
        const items: [string, string | null][] = [
          ...(n.class ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .map((c): [string, string | null] => [c, null]),
          ...Object.keys(n.toggle).flatMap((k) =>
            k
              .split(/\s+/)
              .filter(Boolean)
              .map((c): [string, string | null] => [c, k]),
          ),
        ]
        for (let i = 0; i < items.length; i++)
          for (let j = i + 1; j < items.length; j++) {
            if (items[i]![1] !== null && items[i]![1] === items[j]![1]) continue
            check(n.id, items[i]!, items[j]!, n)
          }
      })
  return found
}

interface Agreement {
  project: string
  real: number
  exclusive: number
  hz079: number
  missing: string[]
  extra: string[]
  exclusiveReported: string[]
}

const nodeAt = (ir: ProjectIR, pointer: string): string => {
  let v: unknown = ir
  for (const t of parsePointer(pointer)) {
    if (t === 'class' || t === 'toggle') break
    v = (v as Record<string, unknown>)[t]
  }
  return (v as { id: string }).id
}

const pairKey = (node: string, a: string, b: string) => `${node} ${[a, b].sort().join(' | ')}`

/** The scan's pairs against the validator's HZ079 (ADR 0045 F): equal sets, exclusive toggle pairs never reported. */
async function agreement(
  name: string,
  dir: string,
  build: ReturnType<typeof buildProject>,
  scanned: Conflict[],
): Promise<Agreement> {
  const styles = await compileStyles(build, { minify: false, base: join(root, dir) })
  const found = validate(build.ir, {
    bindings: build.bindings,
    unknownClasses: styles.unknown,
    classes: styles.classes,
  }).filter((d: Diagnostic) => d.code === 'HZ079')
  const toggles = new Map<string, ViewNode>()
  for (const feature of Object.values(build.ir.features))
    for (const view of Object.values(feature.views)) walk(view.root, (n) => toggles.set(n.id, n))
  const isExclusive = (c: Conflict) => {
    if (c.kind !== 'toggle-toggle') return false
    const n = toggles.get(c.node)
    if (n?.kind !== 'el' && n?.kind !== 'widget') return false
    const keyOf = (cls: string) => Object.keys(n.toggle).find((k) => k.split(/\s+/).includes(cls))!
    return exclusive(n.toggle[keyOf(c.a)]!, n.toggle[keyOf(c.b)]!)
  }
  const real = new Set(scanned.filter((c) => !isExclusive(c)).map((c) => pairKey(c.node, c.a, c.b)))
  const excl = new Set(scanned.filter(isExclusive).map((c) => pairKey(c.node, c.a, c.b)))
  const reported = new Set(
    found.map((d) => {
      const [a, b] = [...d.message.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
      return pairKey(nodeAt(build.ir, d.location.pointer), a!, b!)
    }),
  )
  return {
    project: name,
    real: real.size,
    exclusive: excl.size,
    hz079: reported.size,
    missing: [...real].filter((k) => !reported.has(k)),
    extra: [...reported].filter((k) => !real.has(k)),
    exclusiveReported: [...excl].filter((k) => reported.has(k)),
  }
}

mkdirSync(out, { recursive: true })
const summary: Record<string, unknown> = {}
const allConflicts: Conflict[] = []
const agreements: Agreement[] = []
for (const dir of projects) {
  const name = dir.replaceAll('/', '-')
  const config = (await import(pathToFileURL(join(root, dir, 'hozu.config.ts')).href)).default
  const build = buildProject(config, { sources: false })
  writeFileSync(
    join(out, `${name}.ir.json`),
    `${JSON.stringify(JSON.parse(canonicalStringify(build.ir)), null, 2)}\n`,
  )
  summary[name] = {
    diagnostics: build.diagnostics.map((d) => d.code).sort(),
    routes: routeSummary(build.ir),
  }
  const scanned = await conflicts(name, dir, build)
  allConflicts.push(...scanned)
  agreements.push(await agreement(name, dir, build, scanned))
}

const base = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
writeFileSync(
  join(out, 'summary.json'),
  `${JSON.stringify({ base, p7: clientBytes('client.js'), projects: summary }, null, 2)}\n`,
)
writeFileSync(join(out, 'conflicts.json'), `${JSON.stringify(allConflicts, null, 2)}\n`)
writeFileSync(join(out, 'agreement.json'), `${JSON.stringify(agreements, null, 2)}\n`)
const sum = (k: 'real' | 'exclusive' | 'hz079') => agreements.reduce((n, a) => n + a[k], 0)
const disagree = agreements.filter((a) => a.missing.length || a.extra.length || a.exclusiveReported.length)
console.log(
  `scan: ${sum('real')} real pairs, ${sum('exclusive')} exclusive; HZ079: ${sum('hz079')}; ${disagree.length ? `DISAGREE in ${disagree.map((a) => a.project).join(', ')}` : 'agree'}`,
)
console.log(
  `${projects.length} projects, P7 ${[...clientSeen].length} files, ${allConflicts.length} conflicts`,
)
console.log(relative(root, out))
