import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Infer, Schema } from '../schema/standard.ts'

export interface RouteDef {
  path: string
  params: Schema | null
}

export interface RouteDecl<P = unknown> extends Decl<'route'>, Typed<P> {}

export const route = <S extends Schema | null>(config: {
  path: string
  params: S
}): RouteDecl<S extends Schema ? Infer<S> : null> =>
  brand({}, 'route', { path: config.path, params: config.params } satisfies RouteDef)
