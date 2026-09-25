import type { GuardExpr, ValueExpr } from './types.ts'

export type RefExpr = Extract<ValueExpr, { ref: string }>

export function anyRef(v: ValueExpr, test: (ref: RefExpr) => boolean): boolean {
  if ('ref' in v) return test(v)
  if ('object' in v) {
    for (const k in v.object) if (anyRef(v.object[k]!, test)) return true
    return false
  }
  if ('fn' in v) return anyRef(v.arg, test)
  if ('test' in v) return anyGuardRef(v.test, test)
  return false
}

export function anyGuardRef(g: GuardExpr, test: (ref: RefExpr) => boolean): boolean {
  switch (g.op) {
    case 'and':
    case 'or':
      return g.args.some((a) => anyGuardRef(a, test))
    case 'not':
      return anyGuardRef(g.arg, test)
    case 'fn':
      return anyRef(g.arg, test)
    default:
      return anyRef(g.left, test) || anyRef(g.right, test)
  }
}

export function eachRef(v: ValueExpr, visit: (ref: RefExpr) => void) {
  anyRef(v, (r) => {
    visit(r)
    return false
  })
}
