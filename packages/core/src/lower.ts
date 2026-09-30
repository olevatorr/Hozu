import { builtinCall, builtinGuard, recorderFns } from './builders/i18n.ts'
import { op } from './builders/op.ts'
import { ifNode } from './builders/ui.ts'
import { infoOf } from './model/decl.ts'
import { exprOf, guardOf, ReferenceEscape } from './model/expr.ts'

const TRANSFORMED = Symbol.for('hozu.transformed')
const FREE = Symbol.for('hozu.freeNames')
const HELPERS = Symbol.for('hozu.fnHelpers')
const ESCAPES = Symbol.for('hozu.escapes')
const NAMES = Symbol.for('hozu.partNames')

export type EscapeKind = 'helper' | 'global' | 'callback' | 'typeof'
export type EscapeSite = [kind: EscapeKind, name: string, line: number, column: number]

const shared = <T>(key: symbol, make: () => T): T => {
  const g = globalThis as unknown as Record<symbol, T | undefined>
  g[key] ??= make()
  return g[key]
}

export const transformedDecls = (): WeakSet<object> => shared(TRANSFORMED, () => new WeakSet())
export const helpersOf = (): WeakMap<object, Record<string, () => unknown>> =>
  shared(HELPERS, () => new WeakMap())
export const freeNamesOf = (): WeakMap<object, string[]> => shared(FREE, () => new WeakMap())
export const escapesOf = (): WeakMap<object, EscapeSite[]> => shared(ESCAPES, () => new WeakMap())
export const partNamesOf = (): WeakMap<object, string> => shared(NAMES, () => new WeakMap())

const test = (x: unknown): any =>
  guardOf(x) || exprOf(x)?.kind === 'call' ? x : builtinGuard('%truthy', { v: x })
const list = (x: unknown): any[] =>
  x === null || x === undefined || x === false ? [] : Array.isArray(x) ? x : [x]

const calls = new Set(['fn', 'part', 'tag'])
const recordable = (f: unknown) =>
  typeof f !== 'function' || calls.has(infoOf(f)?.kind ?? '') || recorderFns.has(f)

const tagged = <T extends object>(map: WeakMap<object, unknown>, decl: T, value: unknown): T => {
  map.set(decl, value)
  return decl
}

export const lower = Object.freeze({
  done: <T extends object>(decl: T): T => {
    transformedDecls().add(decl)
    return decl
  },
  helpers: <T extends object>(decl: T, getters: Record<string, () => unknown>): T =>
    tagged(helpersOf(), decl, getters),
  free: <T extends object>(decl: T, names: string[]): T => tagged(freeNamesOf(), decl, names),
  escapes: <T extends object>(decl: T, sites: EscapeSite[]): T => tagged(escapesOf(), decl, sites),
  name: <T extends object>(decl: T, name: string): T => tagged(partNamesOf(), decl, name),
  call: (f: any, name: string, ...args: unknown[]): any => {
    if (!recordable(f))
      throw new ReferenceEscape(
        `\`${name}\` is a plain function and received a reference, so its operators ran on the placeholder. Declare it with part((…) => …)`,
      )
    return f(...args)
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
  branch: (c: unknown, a: unknown, b: unknown) => ifNode(test(c), list(a), list(b)),
  cond: (c: unknown, a: unknown, b: unknown): any => builtinCall('%cond', { c: test(c), a, b }),
  both: (l: unknown, r: unknown): any => builtinCall('%cond', { c: test(l), a: r, b: l }),
  either: (l: unknown, r: unknown): any => builtinCall('%cond', { c: test(l), a: l, b: r }),
  coalesce: (a: unknown, b: unknown): any => builtinCall('%coalesce', { a, b }),
  concat: (...p: unknown[]): any =>
    builtinCall('%concat', Object.fromEntries(p.map((x, i) => [String(i), x]))),
  length: (v: unknown): any => builtinCall('%length', { v }),
  plus: (a: unknown, b: unknown): any => builtinCall('%plus', { a, b }),
  minus: (a: unknown, b: unknown): any => builtinCall('%minus', { a, b }),
  includes: (l: unknown, v: unknown): any => builtinCall('%includes', { l, v }),
  method: (name: string): never => {
    throw new ReferenceEscape(
      `Method "${name}" cannot run on a reference: references are recorded, not evaluated. For a list use ui.each(list, 'id', (item) => …); for any other computation declare a fn() and call it with the reference`,
    )
  },
  statement: (kind: string): never => {
    throw new ReferenceEscape(
      `An ${kind} statement cannot test a reference (it is always truthy while recording). Return cond ? a : b, or use a guard`,
    )
  },
  set: (t: any, v: any) => op.set(t, v),
  append: (t: any, v: any) => op.append(t, v),
  removeWhere: (t: any, k: string | null, v: any) => op.removeWhere(t, k as never, v),
})
