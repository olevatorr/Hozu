import { brand, type Decl } from '../model/decl.ts'
import type { Ref, Val } from '../model/expr.ts'
import type { QueryDecl } from './effects.ts'
import type { RouteDecl } from './route.ts'
import type { ViewDecl } from './ui.ts'

export interface HeadFields {
  title: Val<string>
  description: Val<string>
  type: 'website' | 'article'
  image: Val<string | null>
  published: Val<string | null>
  noindex: boolean
}

export interface PageDef {
  route: RouteDecl
  views: ViewDecl[]
  assert: 'static' | 'cacheable' | null
  head: {
    query: QueryDecl | null
    input: ((params: any, locale: any) => unknown) | null
    render: (data: any, params: any, locale: any) => HeadFields
    redirects: Record<string, RouteDecl> | null
  }
  entries: { query: QueryDecl; input: unknown; params: (item: any) => unknown } | null
}

export interface PageDecl extends Decl<'page'> {}

export const page = <P, I = never, O = never, E = never, EI = never, EO = never, EE = never>(
  route: RouteDecl<P>,
  config: {
    views: ViewDecl[]
    assert: 'static' | 'cacheable' | null
    head: {
      query: QueryDecl<I, O, E, any> | null
      input: ((params: Ref<P>, locale: Ref<string>) => Val<I>) | null
      render: (data: Ref<O>, params: Ref<P>, locale: Ref<string>) => HeadFields
      redirects: { [K in keyof E]?: RouteDecl<null> } | null
    }
    entries: { query: QueryDecl<EI, EO[], EE, any>; input: Val<EI>; params: (item: Ref<EO>) => Val<P> } | null
  },
): PageDecl => brand({}, 'page', { route, ...config } as PageDef)
