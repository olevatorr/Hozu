import type { Ref } from '../model/expr.ts'
import type { QueryDecl } from './effects.ts'

/**
 * Who may run an effect (ADR 0056 B): a literal like `runs`, or a rule whose callbacks are lowered like guards.
 * - `'anyone'`: no condition (on a `scope: 'user'` query this is HZ090).
 * - `'signedIn'`: the session is not `null`.
 * - `{ allow: ({ session, input }) => … }`: a condition on the session and the input.
 * - `{ owner: { row, session } }`: on a query, every row of the output (or the output object) has
 *   `row(…) === session(…)`; on a mutation, the rule reads the input.
 * - `{ owner: { load, input, row, session } }`: on a mutation, `load` reads the row with `input(…)` first.
 */
export type Access<I = any, Row = any> =
  | 'anyone'
  | 'signedIn'
  | { allow: (scope: { session: Ref<any>; input: Ref<I> }) => boolean }
  | {
      owner: {
        /** On a mutation: the query that reads the row first, with `input`. */
        load?: QueryDecl<any, any>
        input?: (input: Ref<I>) => unknown
        row: (row: Ref<Row>) => unknown
        session: (session: Ref<any>) => unknown
      }
    }

export type AccessDef =
  | { kind: 'anyone' }
  | { kind: 'signedIn' }
  | { kind: 'allow'; test: (scope: { session: unknown; input: unknown }) => unknown }
  | {
      kind: 'owner'
      row: (row: unknown) => unknown
      session: (session: unknown) => unknown
      load: QueryDecl | null
      input: ((input: unknown) => unknown) | null
    }

/** Every rule but `'anyone'` refuses a null session before the resolver runs (ADR 0069 B7, ADR 0070 B3). */
export type SignedBy<A> = [A] extends [never] ? false : A extends 'anyone' ? false : true

const isFn = (x: unknown): x is (...args: never[]) => unknown => typeof x === 'function'

/** Reads an `access` value; null when it is not one of the forms. */
export function accessOf(value: unknown): AccessDef | null {
  if (value === 'anyone' || value === 'signedIn') return { kind: value }
  if (!value || typeof value !== 'object') return null
  const v = value as { allow?: unknown; owner?: Record<string, unknown> }
  if (isFn(v.allow))
    return { kind: 'allow', test: v.allow as (scope: { session: unknown; input: unknown }) => unknown }
  const o = v.owner
  if (o && isFn(o.row) && isFn(o.session))
    return {
      kind: 'owner',
      row: o.row as (row: unknown) => unknown,
      session: o.session as (session: unknown) => unknown,
      load: (o.load as QueryDecl | undefined) ?? null,
      input: isFn(o.input) ? (o.input as (input: unknown) => unknown) : null,
    }
  return null
}
