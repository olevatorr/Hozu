import { builtinCall, builtinGuard } from './builders/i18n.ts'
import { op } from './builders/op.ts'
import { ui } from './builders/ui.ts'
import { GUARD, RecorderError } from './model/expr.ts'

const TRANSFORMED = Symbol.for('hozu.transformed')

const FREE = Symbol.for('hozu.freeNames')

export const transformedDecls = (): WeakSet<object> => {
  const g = globalThis as { [TRANSFORMED]?: WeakSet<object> }
  g[TRANSFORMED] ??= new WeakSet()
  return g[TRANSFORMED]
}

export const freeNamesOf = (): WeakMap<object, string[]> => {
  const g = globalThis as { [FREE]?: WeakMap<object, string[]> }
  g[FREE] ??= new WeakMap()
  return g[FREE]
}

const isGuard = (x: unknown) => typeof x === 'object' && x !== null && GUARD in x
const test = (x: unknown): any => (isGuard(x) ? x : builtinGuard('%truthy', { v: x }))
const list = (x: unknown): any[] =>
  x === null || x === undefined || x === false ? [] : Array.isArray(x) ? x : [x]

export const lower = Object.freeze({
  done: <T extends object>(decl: T): T => {
    transformedDecls().add(decl)
    return decl
  },
  free: <T extends object>(decl: T, names: string[]): T => {
    freeNamesOf().set(decl, names)
    return decl
  },
  eq: (a: any, b: any) => op.eq(a, b),
  neq: (a: any, b: any) => op.neq(a, b),
  lt: (a: any, b: any) => op.lt(a, b),
  lte: (a: any, b: any) => op.lte(a, b),
  gt: (a: any, b: any) => op.gt(a, b),
  gte: (a: any, b: any) => op.gte(a, b),
  and: (...args: unknown[]) => op.and(...args.map(test)),
  or: (...args: unknown[]) => op.or(...args.map(test)),
  not: (a: unknown) => op.not(test(a)),
  test,
  branch: (c: unknown, a: unknown, b: unknown) => ui.if(test(c), list(a), list(b)),
  cond: (c: unknown, a: unknown, b: unknown): any => builtinCall('%cond', { c: test(c), a, b }),
  coalesce: (a: unknown, b: unknown): any => builtinCall('%coalesce', { a, b }),
  concat: (...p: unknown[]): any =>
    builtinCall('%concat', Object.fromEntries(p.map((x, i) => [String(i), x]))),
  length: (v: unknown): any => builtinCall('%length', { v }),
  plus: (a: unknown, b: unknown): any => builtinCall('%plus', { a, b }),
  minus: (a: unknown, b: unknown): any => builtinCall('%minus', { a, b }),
  method: (name: string): never => {
    throw new RecorderError(
      `Method "${name}" cannot run on a reference: references are recorded, not evaluated. For a list use ui.each(list, 'id', (item) => …); for any other computation declare a fn() and call it with the reference.`,
    )
  },
  statement: (kind: string): never => {
    throw new RecorderError(
      `An ${kind} statement cannot test a reference (it is always truthy while recording). Return cond ? a : b, or use a guard.`,
    )
  },
  set: (t: any, v: any) => op.set(t, v),
  inc: (t: any, v: any) => op.inc(t, v),
  append: (t: any, v: any) => op.append(t, v),
  removeWhere: (t: any, k: string, v: any) => op.removeWhere(t, k as never, v),
})
