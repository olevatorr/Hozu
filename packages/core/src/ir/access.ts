import type { AccessIR, GuardExpr, ValueExpr } from './types.ts'

const ops: Record<string, string> = { eq: '===', neq: '!==', lt: '<', lte: '<=', gt: '>', gte: '>=' }

const value = (v: ValueExpr): string => {
  if ('ref' in v) {
    const base = v.ref === 'result' ? 'row' : v.ref === 'binding' ? 'item' : v.ref
    return [base, ...v.path].join('.')
  }
  if ('literal' in v) return JSON.stringify(v.literal)
  if ('fn' in v) return `${v.fn}(${value(v.arg)})`
  if ('test' in v) return guard(v.test)
  if ('object' in v)
    return `{ ${Object.entries(v.object)
      .map(([k, x]) => `${k}: ${value(x)}`)
      .join(', ')} }`
  return '…'
}

const guard = (g: GuardExpr): string => {
  switch (g.op) {
    case 'and':
    case 'or':
      return g.args.map((a) => `(${guard(a)})`).join(g.op === 'and' ? ' && ' : ' || ')
    case 'not':
      return `!(${guard(g.arg)})`
    case 'fn':
      return `${g.fn}(${value(g.arg)})`
    default:
      return `${value(g.left)} ${ops[g.op]} ${value(g.right)}`
  }
}

/** One readable line per rule, for the lock, `hozu why` and `hozu map` (ADR 0056 B). */
export function accessSummary(a: AccessIR): string {
  switch (a.kind) {
    case 'anyone':
      return "'anyone'"
    case 'signedIn':
      return "'signedIn'"
    case 'allow':
      return `allow(${guard(a.test)})`
    case 'owner':
      return `owner(${value(a.row)} === ${value(a.session)}${a.load ? `, load ${a.load.query}(${value(a.load.input)})` : ''})`
  }
}
