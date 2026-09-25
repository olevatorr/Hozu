import { brand, type Decl } from '../model/decl.ts'

export interface RouteDef {
  path: string
}

export interface RouteDecl extends Decl<'route'> {}

export const route = (config: { path: string }): RouteDecl =>
  brand({}, 'route', { path: config.path } satisfies RouteDef)
