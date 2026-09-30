import { brand, type Decl } from '../model/decl.ts'
import { callExpr, type Val } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'

export interface FnDef {
  input: Schema
  output: Schema
  impl: (input: never) => unknown
}

export interface FnDecl<I = any, O = any> extends Decl<'fn'> {
  (arg: Val<I>): O
}

export function fn<I extends Schema, O extends Schema>(config: {
  input: I
  output: O
  impl: (input: Infer<I>) => Infer<O>
}): FnDecl<Infer<I>, Infer<O>> {
  const call = (arg: unknown) => callExpr(call, arg)
  return brand(call, 'fn', { ...config } satisfies FnDef) as never
}
