import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Ref } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { TagUse } from './tag.ts'

export type Freshness = 'static' | 'live' | { revalidate: number } | { swr: number }

export type ErrorSchemas = Record<string, Schema>

type ErrorTypes<E extends ErrorSchemas> = { [K in keyof E]: Infer<E[K]> }

export interface EffectTypes<I, O, E> {
  input: I
  output: O
  errors: E
}

export interface QueryDef {
  input: Schema
  output: Schema
  errors: ErrorSchemas
  scope: 'public' | 'user'
  freshness: Freshness
  tags: (input: any) => TagUse[]
}

export interface MutationDef {
  input: Schema
  output: Schema
  errors: ErrorSchemas
  invalidates: (input: any) => TagUse[]
}

export interface QueryDecl<I = any, O = any, E = any> extends Decl<'query'>, Typed<EffectTypes<I, O, E>> {}

export interface MutationDecl<I = any, O = any, E = any>
  extends Decl<'mutation'>,
    Typed<EffectTypes<I, O, E>> {}

export type EffectDecl<I = any, O = any, E = any> = QueryDecl<I, O, E> | MutationDecl<I, O, E>

export const query = <I extends Schema, O extends Schema, E extends ErrorSchemas>(config: {
  input: I
  output: O
  errors: E
  scope: 'public' | 'user'
  freshness: Freshness
  tags: (input: Ref<Infer<I>>) => TagUse[]
}): QueryDecl<Infer<I>, Infer<O>, ErrorTypes<E>> => brand({}, 'query', { ...config } satisfies QueryDef)

export const mutation = <I extends Schema, O extends Schema, E extends ErrorSchemas>(config: {
  input: I
  output: O
  errors: E
  invalidates: (input: Ref<Infer<I>>) => TagUse[]
}): MutationDecl<Infer<I>, Infer<O>, ErrorTypes<E>> =>
  brand({}, 'mutation', { ...config } satisfies MutationDef)
