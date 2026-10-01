// ADR 0045: node bench/ui/compare.ts <dir> [--base <dir of an earlier baseline.ts --out>]
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tokens = (c: unknown) => (typeof c === 'string' ? c.split(/\s+/).filter(Boolean) : [])

/** Phase 4: widgets → client components and widget nodes → component nodes, counted (ADR 0045 L). */
function widgetsToComponents(
  ir: Record<string, any>,
  after: Record<string, any>,
  count: (k: string) => void,
) {
  const given = new Set<string>()
  const visit = (v: any, map: (n: any) => any): any => {
    if (Array.isArray(v)) return v.map((x) => visit(x, map))
    if (typeof v !== 'object' || v === null) return v
    const out: Record<string, any> = {}
    for (const [k, x] of Object.entries(map(v))) out[k] = visit(x, map)
    return out
  }
  visit(ir.features, (n) => {
    if (n.kind === 'widget' && n.children.length) given.add(n.widget)
    return n
  })
  for (const f of Object.values(ir.features) as Record<string, any>[]) {
    const widgets = (f.widgets ?? {}) as Record<string, any>
    if (!Object.keys(widgets).length) count('empty widgets removed')
    for (const [sym, w] of Object.entries(widgets)) {
      const built = after.features[f.id]?.components?.[sym]
      f.components[sym] = {
        tag: w.tag,
        props: w.props,
        variants: {},
        defaults: {},
        slots: [],
        children: w.wraps || given.has(`${f.id}.${sym}`),
        events: [],
        emits: w.events,
        extend: true,
        owned: [],
        client: { load: w.load, sourceHash: built?.client?.sourceHash ?? w.sourceHash },
        sourceHash: built?.sourceHash ?? '',
      }
      count('widget → component')
      count('render hash')
      if (built?.client?.sourceHash !== w.sourceHash) count('client module hash')
    }
    delete f.widgets
  }
  ir.features = visit(ir.features, (n) => {
    if (n.kind !== 'widget' || typeof n.widget !== 'string') return n
    count('widget node → component node')
    const added = tokens(n.class)
    const { widget, kind: _, ...rest } = n
    return {
      ...rest,
      kind: 'component',
      use: { component: widget, variant: {}, added, overrides: added.filter((c) => c.endsWith('!')) },
      class: added.length ? added.join(' ') : null,
    }
  })
  return ir
}

const sorted = (v: any): any =>
  Array.isArray(v)
    ? v.map(sorted)
    : typeof v === 'object' && v !== null
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sorted(v[k])]),
        )
      : v

const dir = resolve(process.argv[2] ?? '')
const flag = process.argv.indexOf('--base')
if (flag > 0) {
  const earlier = resolve(process.argv[flag + 1] ?? '')
  const names = readdirSync(earlier).filter((f) => f.endsWith('.ir.json'))
  let same = 0
  for (const name of names) {
    const after = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    const counts = new Map<string, number>()
    const before = widgetsToComponents(JSON.parse(readFileSync(join(earlier, name), 'utf8')), after, (k) =>
      counts.set(k, (counts.get(k) ?? 0) + 1),
    )
    const equal = JSON.stringify(sorted(before)) === JSON.stringify(sorted(after))
    if (equal) same++
    const note = [...counts].map(([k, n]) => `${k} ${n}`).join(', ')
    console.log(`${equal ? 'equal  ' : 'DIFFERS'} ${name}${note ? ` (${note})` : ''}`)
  }
  console.log(`${same} / ${names.length} equal to ${earlier}`)
  process.exit(0)
}
const base = fileURLToPath(new URL('./baseline-0.8/', import.meta.url))
const withComponents = new Set(['examples-notes.ir.json'])
const wrappers = new Set(['ui.Field'])

type Node = Record<string, any>

const v2 = (name: string, ir: Record<string, any>) => {
  const { kits, ...rest } = ir
  const open = withComponents.has(name)
  if (!open && JSON.stringify(kits) !== '{}') throw new Error(`${name}: kits is not {}`)
  for (const feature of Object.values(rest.features) as Record<string, any>[]) {
    if (!open && JSON.stringify(feature.components) !== '{}')
      throw new Error(`${name}: ${feature.id}.components is not {}`)
    delete feature.components
  }
  return { ...rest, irVersion: 2 }
}

const renumber = (node: Node, from: string, to: string): Node =>
  JSON.parse(
    JSON.stringify(node, (_, v) =>
      typeof v === 'string' && (v === from || v.startsWith(`${from}/`)) ? to + v.slice(from.length) : v,
    ),
  )

const unwrapped: string[] = []
function normalize(node: Node): Node {
  if (Array.isArray(node)) return node.map(normalize)
  if (typeof node !== 'object' || node === null) return node
  const out: Node = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'use') continue
    out[k] =
      k === 'class' && typeof v === 'string' ? v.split(/\s+/).filter(Boolean).sort().join(' ') : normalize(v)
  }
  if (Array.isArray(out.children) && typeof out.id === 'string') {
    const flat: Node[] = []
    for (const [i, child] of (node.children as Node[]).entries()) {
      const c = out.children[i]
      if (wrappers.has(child?.use?.component)) {
        unwrapped.push(`${child.use.component} at ${child.id}`)
        flat.push(...c.children)
      } else flat.push(c)
    }
    out.children = flat.map((c, i) => renumber(c, c.id, `${out.id}/${i}`))
  }
  return out
}

const names = readdirSync(base).filter((f) => f.endsWith('.ir.json'))
let equal = 0
for (const name of names) {
  const before = JSON.parse(readFileSync(join(base, name), 'utf8'))
  const after = JSON.parse(readFileSync(join(dir, name), 'utf8'))
  if (after.irVersion !== 3) throw new Error(`${name}: irVersion ${after.irVersion}`)
  unwrapped.length = 0
  const open = withComponents.has(name)
  const same = open
    ? JSON.stringify(normalize(before)) === JSON.stringify(normalize(v2(name, after)))
    : JSON.stringify(before) === JSON.stringify(v2(name, after))
  if (same) equal++
  const note = open
    ? ` (use removed, class as a set${unwrapped.length ? `, unwrapped ${unwrapped.join(', ')}` : ''})`
    : ''
  console.log(`${same ? 'equal  ' : 'DIFFERS'} ${name}${note}`)
}
const summary = (d: string) => JSON.parse(readFileSync(join(d, 'summary.json'), 'utf8'))
const routes = (s: Record<string, any>) =>
  JSON.stringify(Object.fromEntries(Object.entries(s.projects).map(([k, v]: [string, any]) => [k, v.routes])))
const sameRoutes = routes(summary(base)) === routes(summary(dir))
console.log(
  `${equal} / ${names.length} equal; routes (js, islands, widgets) ${sameRoutes ? 'equal' : 'DIFFER'}`,
)
console.log(`P7 ${summary(base).p7} → ${summary(dir).p7}`)
process.exitCode = equal === names.length && sameRoutes ? 0 : 1
