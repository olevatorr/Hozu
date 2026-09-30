import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Ref } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { ErrorSchemas } from './effects.ts'
import type { TagUse } from './tag.ts'

export type EndpointMethod = 'GET' | 'POST'

export type EndpointStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429

export type EndpointOutput = Schema | 'redirect' | 'response'

declare const REDIRECT: unique symbol

export interface Redirect {
  readonly [REDIRECT]: true
}

export interface EndpointDef {
  method: EndpointMethod
  path: string
  input: Schema | 'raw'
  output: EndpointOutput
  errors?: ErrorSchemas
  failed?: Record<string, EndpointStatus>
  invalidates?: (input: any) => TagUse[]
}

export interface EndpointDecl<I = any, O = any, E = any, M extends EndpointMethod = EndpointMethod>
  extends Decl<'endpoint'>,
    Typed<{ input: I; output: O; errors: E; method: M }> {}

type InputOf<IS> = IS extends Schema ? Infer<IS> : null
type OutputOf<OS> = OS extends Schema ? Infer<OS> : OS extends 'redirect' ? Redirect : Response
type ErrorTypes<E extends ErrorSchemas> = { [K in keyof E]: Infer<E[K]> }
type Failed<E> = [keyof E] extends [never]
  ? { failed?: never }
  : { failed: { [K in keyof E]: EndpointStatus } }

export const endpoint = <
  M extends EndpointMethod,
  IS extends Schema | 'raw',
  OS extends EndpointOutput,
  E extends ErrorSchemas = Record<never, never>,
>(
  config: {
    method: M
    path: string
    input: IS
    output: OS
    errors?: E
    invalidates?: (input: Ref<InputOf<IS>>) => TagUse[]
  } & Failed<E>,
): EndpointDecl<InputOf<IS>, OutputOf<OS>, ErrorTypes<E>, M> =>
  brand({}, 'endpoint', { ...config } as EndpointDef) as never
