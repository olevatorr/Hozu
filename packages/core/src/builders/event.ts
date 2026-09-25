import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Infer, Schema } from '../schema/standard.ts'

export interface EventDef {
  payload: Schema
}

export interface EventDecl<P = unknown> extends Decl<'event'>, Typed<P> {}

export const event = <S extends Schema>(config: { payload: S }): EventDecl<Infer<S>> =>
  brand({}, 'event', { payload: config.payload } satisfies EventDef)
