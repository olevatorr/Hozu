import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Infer, Schema } from '../schema/standard.ts'

export interface RouteDef {
  path: string
  params: Schema | null
  search: Schema | null
}

declare const SEARCH: unique symbol

export interface RouteDecl<P = unknown, S = unknown> extends Decl<'route'>, Typed<P> {
  readonly [SEARCH]?: S
}

export const route = <PS extends Schema | null, SS extends Schema | null>(config: {
  path: string
  params: PS
  search: SS
}): RouteDecl<PS extends Schema ? Infer<PS> : null, SS extends Schema ? Infer<SS> : null> =>
  brand({}, 'route', { path: config.path, params: config.params, search: config.search } satisfies RouteDef)
