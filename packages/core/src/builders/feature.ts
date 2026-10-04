import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { SchemaAdapter } from '../schema/adapter.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { Asset } from './asset.ts'
import type { ComponentDecl, KitDecl } from './component.ts'
import type { ContractDecl } from './contract.ts'
import type { MutationDecl, QueryDecl } from './effects.ts'
import type { EndpointDecl } from './endpoint.ts'
import type { EventDecl } from './event.ts'
import type { FnDecl } from './fn.ts'
import type { HttpConfig } from './http.ts'

import type { MachineDecl } from './machine.ts'
import type { PageDecl } from './page.ts'
import type { RouteDecl } from './route.ts'
import type { TagDecl } from './tag.ts'
import type { ViewDecl } from './ui.ts'

export interface FeatureParts {
  id: string
  intent: { summary: string; invariants: string[] }
  styles: URL[]
  fetch: URL | null
  connect: Connect[]
  imports: FeatureDecl[]
  tags: Record<string, TagDecl<any>>
  events: Record<string, EventDecl<any>>
  queries: Record<string, QueryDecl>
  mutations: Record<string, MutationDecl>
  fns: Record<string, FnDecl>
  machine: MachineDecl | null
  views: Record<string, ViewDecl>
  components: Record<string, ComponentDecl>
  endpoints: Record<string, EndpointDecl>
  contracts: Record<string, ContractDecl>
  messages: Decl<'messages'> | null
  exports: {
    events: EventDecl<any>[]
    queries: QueryDecl[]
    mutations: MutationDecl[]
    tags: TagDecl<any>[]
    fns: FnDecl[]
    views: ViewDecl[]
    endpoints: EndpointDecl[]
  }
}

export interface FeatureDecl extends Decl<'feature'> {
  readonly id: string
}

export interface FeatureConfig {
  id: string
  intent: { summary: string; invariants?: string[] }
  declarations: readonly object[]
  imports?: FeatureDecl[]
  exports?: Decl[]
  styles?: URL[]
  /** `features/<name>/fetch.ts`: the implementations of the feature's `'either'` / `'browser'` effects (ADR 0049). */
  fetch?: URL
  /**
   * The other origins fetch.ts calls from the browser (ADR 0051): `'https://api.github.com'`, or `{ env: 'API_URL' }`
   * for a public env variable holding the URL. Hozu adds them to CSP `connect-src`.
   */
  connect?: Connect[]
}

export type Connect = string | { env: string }

export const feature = (config: FeatureConfig): FeatureDecl =>
  brand({ id: config.id }, 'feature', { ...config })

export interface ProjectConfig {
  schema: SchemaAdapter
  session?: Schema
  routes: Record<string, RouteDecl>
  site?: {
    /** The site's origin, or `{ env: 'SITE_URL' }` to read it from a declared env variable at startup (ADR 0057 A2). */
    url: string | { env: string }
    name: string
    lang: string
    locales?: string[]
    offline?: RouteDecl
    icon?: Asset
    themeColor?: string
  }
  styles?: URL
  app?: URL
  notFound?: RouteDecl
  error?: RouteDecl
  pages: PageDecl[]
  features: FeatureDecl[]
  kits?: KitDecl[]
  /** Warnings kept on purpose (ADR 0053 C): `[{ code: 'HZ036', at: 'notes.SaveDraft', reason: '…' }]`. */
  accept?: { code: string; at: string; reason: string }[]
  http?: HttpConfig
  env?: EnvConfig
}

/** The app's environment (ADR 0019, 0052). */
export interface EnvConfig<ES = Schema> {
  /** Env files the CLI reads, relative to hozu.config.ts: `['.env', '.env.local']`; the shell wins over them. */
  files?: string[]
  server?: ES
  public?: Schema
  /** `{ API_URL: 'API_URL_INTERNAL' }`: on the server, `'either'` effects read the internal URL when it is set. */
  internal?: Record<string, string>
}

export interface ProjectDecl<Session = unknown, Env = unknown>
  extends Decl<'project'>,
    Typed<{ session: Session; env: Env }> {}

export const project = <S extends Schema = never, R = Record<string, never>, ES extends Schema = never>(
  config: Omit<ProjectConfig, 'session' | 'http' | 'env'> & {
    session?: S
    http?: HttpConfig<R>
    env?: EnvConfig<ES>
  },
): ProjectDecl<
  [S] extends [never] ? null : Infer<S>,
  [ES] extends [never] ? Record<string, never> : Infer<ES>
> => brand({}, 'project', { ...config })
