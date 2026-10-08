import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Ref } from '../model/expr.ts'
import type { Infer, InferInput, Schema } from '../schema/standard.ts'
import type { Access, SignedBy } from './access.ts'
import type { TagUse } from './tag.ts'

export type Freshness =
  | 'static'
  | 'request'
  | 'live'
  | { revalidate: number }
  | { swr: number }
  | { poll: number }

export type ErrorSchemas = Record<string, Schema>

type ErrorTypes<E extends ErrorSchemas> = { [K in keyof E]: Infer<E[K]> }

export type Scope = 'public' | 'user'

export type Runs = 'server' | 'browser' | 'either'

export interface EffectTypes<I, O, E, Sc = Scope, W = I, Sg = boolean> {
  input: I
  /** What a caller passes: the schema's input type (`z.coerce.number()` takes a string), ADR 0057 C. */
  wire: W
  output: O
  errors: E
  scope: Sc
  /** Its access guarantees a session (`'signedIn'`, `{ owner }`): the resolver's session is not null. */
  signed: Sg
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

export interface QueryDecl<I = any, O = any, E = any, Sc extends Scope = Scope, Sg extends boolean = boolean>
  extends Decl<'query'>,
    Typed<EffectTypes<I, O, E, Sc, I, Sg>> {}

export interface MutationDecl<I = any, O = any, E = any, W = I, Sg extends boolean = boolean>
  extends Decl<'mutation'>,
    Typed<EffectTypes<I, O, E, Scope, W, Sg>> {}

export type EffectDecl<I = any, O = any, E = any, W = I> = QueryDecl<I, O, E> | MutationDecl<I, O, E, W>

type RowOf<O> = O extends readonly (infer T)[] ? T : O

/** `access` is required where the server can enforce it: a server-run user query, and a server-run mutation. */
type QueryAccess<Sc, R> = Sc extends 'user'
  ? R extends 'server'
    ? { /** Who may read it (ADR 0056 B). */ access: unknown }
    : { access?: never }
  : { access?: never }

type MutationAccess<R> = R extends 'server'
  ? { /** Who may run it (ADR 0056 B). */ access: unknown }
  : { access?: never }

export const query = <
  I extends Schema,
  O extends Schema,
  Sc extends Scope,
  R extends Runs,
  E extends ErrorSchemas = Record<never, never>,
  A extends Access<Infer<I>, RowOf<Infer<O>>> = Access<Infer<I>, RowOf<Infer<O>>>,
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
    access?: A
  } & QueryAccess<Sc, R>,
): QueryDecl<Infer<I>, Infer<O>, ErrorTypes<E>, Sc, SignedBy<A>> =>
  brand({}, 'query', { errors: {}, tags: () => [], ...config } as QueryDef)

export const mutation = <
  I extends Schema,
  O extends Schema,
  R extends Runs,
  E extends ErrorSchemas = Record<never, never>,
  A extends Access<Infer<I>, any> = Access<Infer<I>, any>,
>(
  config: {
    input: I
    output: O
    errors?: E
    invalidates?: (input: Ref<Infer<I>>) => TagUse[]
    /** Where the implementation runs (ADR 0049); required since 0.14 (ADR 0053 A). */
    runs: R
    access?: A
  } & MutationAccess<R>,
): MutationDecl<Infer<I>, Infer<O>, ErrorTypes<E>, InferInput<I>, SignedBy<A>> =>
  brand({}, 'mutation', { errors: {}, invalidates: () => [], ...config } as MutationDef)
