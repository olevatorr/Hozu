import type { SourceLoc } from '../ir/diagnostic.ts'
import type { CompareOp, RefSource } from '../ir/types.ts'
import { captureSource } from '../source/capture.ts'
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
  | { op: 'removeWhere'; target: unknown; key: string | null; value: unknown }

export interface Expr<T> extends Typed<T> {
  readonly [EXPR]: RawExpr
}

declare const CALL: unique symbol

export interface Call<T> extends Expr<T> {
  readonly [CALL]: true
}

export type Ref<T> = T

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

type RecorderDetail = { cause: string; fix: { summary: string; snippet: string | null; patch: null } }

export class RecorderError extends Error {
  override name = 'RecorderError'
  readonly detail: RecorderDetail | undefined
  constructor(message: string, detail?: RecorderDetail) {
    super(message)
    this.detail = detail
  }
}

export class ReferenceEscape extends RecorderError {
  override name = 'ReferenceEscape'
  readonly source: SourceLoc | null
  constructor(message: string, at?: SourceLoc | null) {
    const source = at === undefined ? captureSource() : at
    super(source ? `${message} (${source.file}:${source.line}:${source.column})` : message)
    this.source = source
  }
}

const leak = (what: string, how: string): never => {
  throw new ReferenceEscape(
    `${what} was evaluated as JavaScript (${how}). References are recorded, not evaluated: write the logic in a builder callback, or make the helper a part()`,
  )
}

const PRIMITIVE = new Set<PropertyKey>([Symbol.toPrimitive, 'toString', 'valueOf', 'toJSON'])

const traps = (what: () => string) => ({
  set: () => leak(what(), 'assignment'),
  defineProperty: () => leak(what(), 'assignment'),
  deleteProperty: () => leak(what(), 'delete'),
  ownKeys: () => leak(what(), 'its keys were read: Object.keys, a spread or a for…in'),
})

const roots = new Map<string, unknown>()

export function createRef(ref: RefSource | 'binding', depth: number, path: readonly string[]): any {
  const expr: RawExpr = { kind: 'ref', ref, depth, path }
  const children = new Map<string, unknown>()
  const what = () => `Reference "${path.join('.') || '<root>'}"`
  return new Proxy(Object.create(null), {
    ...traps(what),
    has: (_, key) => (key === EXPR ? true : typeof key === 'symbol' ? false : leak(what(), `"${key}" in`)),
    get(_, key) {
      if (key === EXPR) return expr
      if (PRIMITIVE.has(key))
        return () =>
          leak(what(), key === 'toJSON' ? 'JSON.stringify' : 'it was converted to a string or a number')
      if (typeof key === 'symbol' || key === 'then') return undefined
      let child = children.get(key)
      if (child === undefined) {
        child = createRef(ref, depth, [...path, key])
        children.set(key, child)
      }
      return child
    },
  })
}

let lengthOf: ((v: unknown) => unknown) | null = null

export const setLength = (make: (v: unknown) => unknown) => {
  lengthOf = make
}

export function callExpr(fn: object, arg: unknown): any {
  const expr: RawExpr = { kind: 'call', fn, arg }
  const what = () => 'A fn(), message or builtin result'
  let length: unknown
  const self: object = new Proxy(Object.create(null), {
    ...traps(what),
    has: (_, key) => (key === EXPR ? true : typeof key === 'symbol' ? false : leak(what(), `"${key}" in`)),
    get(_, key) {
      if (key === EXPR) return expr
      if (PRIMITIVE.has(key))
        return () =>
          leak(what(), key === 'toJSON' ? 'JSON.stringify' : 'it was converted to a string or a number')
      if (typeof key === 'symbol' || key === 'then') return undefined
      if (key === 'length') {
        length ??= lengthOf!(self)
        return length
      }
      return leak(what(), `its ".${key}" was read; only .length lowers (to %length)`)
    },
  })
  return self
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
