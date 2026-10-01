// ADR 0045 phases 1–2: node bench/ui/compare.ts <dir>, after baseline.ts --out <dir>
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = fileURLToPath(new URL('./baseline-0.8/', import.meta.url))
const dir = resolve(process.argv[2] ?? '')
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
