import type { AssignOp, GuardExpr, ValueExpr } from '@hozu/core/ir'

const local = (ref: string) => ref.slice(ref.indexOf('.') + 1)
const suffix = (path: readonly string[]) => path.map((p) => `.${p}`).join('')

export function renderValue(v: ValueExpr): string {
  if ('literal' in v) return JSON.stringify(v.literal)
  if ('object' in v)
    return `{ ${Object.entries(v.object)
      .map(([k, x]) => `${k}: ${renderValue(x)}`)
      .join(', ')} }`
  if ('fn' in v) return `${local(v.fn)}(${renderValue(v.arg)})`
  if ('test' in v) return `(${renderGuard(v.test)})`
  if ('link' in v) return `link(${local(v.link)}, ${renderValue(v.params)}, ${renderValue(v.search)})`
  if (v.ref === 'binding') return `item${v.depth}${suffix(v.path)}`
  return `${v.ref}${suffix(v.path)}`
}

const symbols = { eq: '==', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' } as const

export function renderGuard(g: GuardExpr): string {
  switch (g.op) {
    case 'and':
    case 'or':
      return g.args.map((a) => `(${renderGuard(a)})`).join(g.op === 'and' ? ' && ' : ' || ')
    case 'not':
      return `!(${renderGuard(g.arg)})`
    case 'fn':
      return `${local(g.fn)}(${renderValue(g.arg)})`
    default:
      return `${renderValue(g.left)} ${symbols[g.op]} ${renderValue(g.right)}`
  }
}

export function renderAssign(a: AssignOp): string {
  const target = `context${suffix(a.path)}`
  switch (a.op) {
    case 'set':
      return `${target} = ${renderValue(a.value)}`
    case 'append':
      return `${target}.push(${renderValue(a.value)})`
    case 'inc':
      return `${target} += ${renderValue(a.value)}`
    case 'removeWhere':
      return `${target} = ${target}.filter(x => x.${a.key} != ${renderValue(a.value)})`
  }
}
