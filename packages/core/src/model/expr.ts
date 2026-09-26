import type { CompareOp, RefSource } from '../ir/types.ts'
import type { Typed } from './decl.ts'

export const EXPR = Symbol.for('hozu.expr')
export const GUARD = Symbol.for('hozu.guard')
export const ASSIGN = Symbol.for('hozu.assign')

export type RawExpr =
  | { kind: 'ref'; ref: RefSource | 'binding'; depth: number; path: readonly string[] }
  | { kind: 'call'; fn: object; arg: unknown }

export type RawGuard =
  | { op: CompareOp; left: unknown; right: unknown }
  | { op: 'and' | 'or'; args: readonly unknown[] }
  | { op: 'not'; arg: unknown }

export type RawAssign =
  | { op: 'set' | 'append' | 'inc'; target: unknown; value: unknown }
  | { op: 'removeWhere'; target: unknown; key: string; value: unknown }

export interface Expr<T> extends Typed<T> {
  readonly [EXPR]: RawExpr
}

declare const CALL: unique symbol

export interface Call<T> extends Expr<T> {
  readonly [CALL]: true
}

type RefProps<T> = [T] extends [readonly unknown[]]
  ? { readonly length: Ref<number> }
  : [T] extends [object]
    ? { readonly [K in keyof T]-?: Ref<T[K]> }
    : unknown

export type Ref<T> = Expr<T> & RefProps<NonNullable<T>>

type ValObject<T> = [T] extends [readonly unknown[]]
  ? never
  : [T] extends [object]
    ? { readonly [K in keyof T]: Val<T[K]> }
    : never

export type Val<T> = T | Expr<T> | ValObject<NonNullable<T>> | ([T] extends [boolean] ? Guard : never)

export interface Guard {
  readonly [GUARD]: RawGuard
}

export interface Assign {
  readonly [ASSIGN]: RawAssign
}

export class RecorderError extends Error {
  override name = 'RecorderError'
}

const misuse = (path: readonly string[]) => () => {
  throw new RecorderError(
    `Reference "${path.join('.') || '<root>'}" was used as a JavaScript value. References are recorded, not evaluated: use op.* for logic or fn() for computation.`,
  )
}

const roots = new Map<string, unknown>()

export function createRef(ref: RefSource | 'binding', depth: number, path: readonly string[]): any {
  const expr: RawExpr = { kind: 'ref', ref, depth, path }
  const children = new Map<string, unknown>()
  return new Proxy(Object.create(null), {
    get(_, key) {
      if (key === EXPR) return expr
      if (key === Symbol.toPrimitive || key === 'toString' || key === 'valueOf' || key === 'toJSON')
        return misuse(path)
      if (typeof key === 'symbol' || key === 'then') return undefined
      let child = children.get(key)
      if (child === undefined) {
        child = createRef(ref, depth, [...path, key])
        children.set(key, child)
      }
      return child
    },
    set: misuse(path),
    defineProperty: misuse(path),
    deleteProperty: misuse(path),
  })
}

export function refProxy(ref: RefSource | 'binding', depth: number): any {
  const key = `${ref}:${depth}`
  let root = roots.get(key)
  if (root === undefined) {
    root = createRef(ref, depth, [])
    roots.set(key, root)
  }
  return root
}

export const exprOf = (value: unknown): RawExpr | null =>
  (typeof value === 'object' || typeof value === 'function') && value !== null
    ? ((value as Partial<Expr<unknown>>)[EXPR] ?? null)
    : null

export const guardOf = (value: unknown): RawGuard | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Guard>)[GUARD] ?? null) : null

export const assignOf = (value: unknown): RawAssign | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Assign>)[ASSIGN] ?? null) : null
