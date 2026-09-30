import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Ref } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { TagUse } from './tag.ts'

export type EndpointMethod = 'GET' | 'POST'

export interface EndpointDef {
  method: EndpointMethod
  path: string
  input: Schema
  output: Schema | 'response'
  invalidates?: (input: any) => TagUse[]
}

export interface EndpointDecl<I = any, O = any> extends Decl<'endpoint'>, Typed<{ input: I; output: O }> {}

export const endpoint = <IS extends Schema, OS extends Schema | 'response'>(config: {
  method: EndpointMethod
  path: string
  input: IS
  output: OS
  invalidates?: (input: Ref<Infer<IS>>) => TagUse[]
}): EndpointDecl<Infer<IS>, OS extends Schema ? Infer<OS> : Response> =>
  brand({}, 'endpoint', { ...config } satisfies EndpointDef) as never
