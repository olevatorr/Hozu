import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Ref } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { Access } from './access.ts'
import type { TagUse } from './tag.ts'

export type Freshness = 'static' | 'request' | 'live' | { revalidate: number } | { swr: number }

export type ErrorSchemas = Record<string, Schema>

type ErrorTypes<E extends ErrorSchemas> = { [K in keyof E]: Infer<E[K]> }

export type Scope = 'public' | 'user'

export type Runs = 'server' | 'browser' | 'either'

export interface EffectTypes<I, O, E, Sc = Scope> {
  input: I
  output: O
  errors: E
  scope: Sc
}

export interface QueryDef {
  input: Schema
  output: Schema
  errors: ErrorSchemas
  scope: 'public' | 'user'
  freshness: Freshness
  tags: (input: any) => TagUse[]
  runs: Runs
  access?: Access
}

export interface MutationDef {
  input: Schema
  output: Schema
  errors: ErrorSchemas
  invalidates: (input: any) => TagUse[]
  runs: Runs
  access?: Access
}

export interface QueryDecl<I = any, O = any, E = any, Sc extends Scope = Scope>
  extends Decl<'query'>,
    Typed<EffectTypes<I, O, E, Sc>> {}

export interface MutationDecl<I = any, O = any, E = any>
  extends Decl<'mutation'>,
    Typed<EffectTypes<I, O, E>> {}

export type EffectDecl<I = any, O = any, E = any> = QueryDecl<I, O, E> | MutationDecl<I, O, E>

type RowOf<O> = O extends readonly (infer T)[] ? T : O

/** `access` is required where the server can enforce it: a server-run user query, and a server-run mutation. */
type QueryAccess<Sc, R, I, Row> = Sc extends 'user'
  ? R extends 'server'
    ? { /** Who may read it (ADR 0056 B). */ access: Access<I, Row> }
    : { access?: never }
  : { access?: never }

type MutationAccess<R, I> = R extends 'server'
  ? { /** Who may run it (ADR 0056 B). */ access: Access<I, any> }
  : { access?: never }

export const query = <
  I extends Schema,
  O extends Schema,
  Sc extends Scope,
  R extends Runs,
  E extends ErrorSchemas = Record<never, never>,
>(
  config: {
    input: I
    output: O
    errors?: E
    scope: Sc
    freshness: Freshness
    tags?: (input: Ref<Infer<I>>) => TagUse[]
    /** Where the implementation runs (ADR 0049); required since 0.14 (ADR 0053 A). */
    runs: R
  } & QueryAccess<Sc, R, Infer<I>, RowOf<Infer<O>>>,
): QueryDecl<Infer<I>, Infer<O>, ErrorTypes<E>, Sc> =>
  brand({}, 'query', { errors: {}, tags: () => [], ...config } as QueryDef)

export const mutation = <
  I extends Schema,
  O extends Schema,
  R extends Runs,
  E extends ErrorSchemas = Record<never, never>,
>(
  config: {
    input: I
    output: O
    errors?: E
    invalidates?: (input: Ref<Infer<I>>) => TagUse[]
    /** Where the implementation runs (ADR 0049); required since 0.14 (ADR 0053 A). */
    runs: R
  } & MutationAccess<R, Infer<I>>,
): MutationDecl<Infer<I>, Infer<O>, ErrorTypes<E>> =>
  brand({}, 'mutation', { errors: {}, invalidates: () => [], ...config } as MutationDef)
