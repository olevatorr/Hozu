import { brand, type Decl } from '../model/decl.ts'
import type { Ref, Val } from '../model/expr.ts'
import type { Asset } from './asset.ts'
import type { QueryDecl } from './effects.ts'
import type { RouteDecl } from './route.ts'
import type { ViewDecl } from './ui.ts'

export interface HeadFields {
  title: Val<string>
  description?: Val<string>
  type?: 'website' | 'article'
  image?: Val<string | null> | Asset
  published?: Val<string | null>
  noindex?: boolean
}

export interface PageDef {
  route: RouteDecl
  views: ViewDecl[]
  assert?: 'static' | 'cacheable'
  head: {
    query?: QueryDecl
    input?: (params: any, locale: any, search: any) => unknown
    render: (data: any, params: any, locale: any, search: any) => HeadFields
    failed?: Record<string, RouteDecl | HeadStatus>
  }
  entries?: {
    query: QueryDecl
    input: unknown
    params: (item: any) => unknown
    lastmod?: (item: any) => unknown
  }
}

export interface PageDecl extends Decl<'page'> {}

export type HeadStatus = 403 | 404 | 410

type HeadAnswer = RouteDecl<null, any> | HeadStatus

/** `Forbidden` (the framework's answer when access refuses, ADR 0056 B) may be mapped too; unmapped it is 403. */
export type HeadFailed<E> = [E] extends [never]
  ? { failed?: { Forbidden?: HeadAnswer } }
  : [keyof E] extends [never]
    ? { failed?: { Forbidden?: HeadAnswer } }
    : { failed: { [K in keyof E]: HeadAnswer } & { Forbidden?: HeadAnswer } }

export const page = <P, I = never, O = never, E = never, EI = never, EO = never, EE = never, S = never>(
  route: RouteDecl<P, S>,
  config: {
    views: ViewDecl[]
    assert?: 'static' | 'cacheable'
    head: {
      query?: QueryDecl<I, O, E, any>
      input?: (params: Ref<P>, locale: Ref<string>, search: Ref<S>) => Val<I>
      render: (data: Ref<O>, params: Ref<P>, locale: Ref<string>, search: Ref<S>) => HeadFields
    } & HeadFailed<E>
    entries?: {
      query: QueryDecl<EI, EO[], EE, any>
      input: Val<EI>
      params: (item: Ref<EO>) => Val<P>
      /** The sitemap's `<lastmod>`: an ISO date (`2026-10-04`) or date-time of the item (ADR 0057 A2). */
      lastmod?: (item: Ref<EO>) => Val<string>
    }
  },
): PageDecl => brand({}, 'page', { route, ...config } as PageDef)
