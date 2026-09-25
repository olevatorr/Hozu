import type { Ref } from '../model/expr.ts'
import type { RouteDecl } from './route.ts'
import type { Href } from './ui.ts'

type ParamNames<P extends string> = P extends `${string}:${infer N}/${infer R}`
  ? N | ParamNames<`/${R}`>
  : P extends `${string}:${infer N}`
    ? N
    : never

export type PathParams<P extends string> = { readonly [K in ParamNames<P>]: Ref<string> }

export type ExternalUrl = `https://${string}` | `http://${string}`

export type Redirects<R> = {
  [From in keyof R]: {
    to: ((params: PathParams<From & string>) => Href) | ExternalUrl
    permanent: boolean
  }
}

export interface HttpConfig<R = Record<string, unknown>> {
  basePath: '' | `/${string}`
  trailingSlash: 'never' | 'always'
  redirects: Redirects<R>
  headers: { routes: RouteDecl<any, any>[] | 'all'; set: Record<string, string> }[]
}
