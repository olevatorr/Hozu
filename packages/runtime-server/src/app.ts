import type { DevOptions } from '@hozu/core/ir'
import { appModuleOf, type BuildResult, buildProject, type ImageSet, type Manifest } from '@hozu/core/ir'
import { type FetchLoader, type ResolverSet, resolverSetOf } from '@hozu/data'
import type { HandlerOptions } from './handler.ts'
import type { ComponentBundle, Stylesheet } from './render.ts'
import type { RenderModule } from './rendered.ts'
import type { SessionStore } from './session.ts'

const APP = Symbol.for('hozu.app')

export interface AppOptions<Session = unknown, Env = unknown>
  extends Omit<
    HandlerOptions,
    | 'build'
    | 'styles'
    | 'components'
    | 'env'
    | 'readFile'
    | 'manifest'
    | 'render'
    | 'images'
    | 'resolvers'
    | 'refreshSession'
  > {
  resolvers: ResolverSet<Session, Env>
  components?: (build: BuildResult) => Promise<ComponentBundle>
  /**
   * Keeps the session valid while the app only reads (ADR 0060 C): runs once per request, before any resolver
   * reads the session. Return the new value (stored in place, the cookie stays), `null` to sign out, or `undefined`.
   */
  refreshSession?: (
    session: NoInfer<Session>,
    ctx: { env: NoInfer<Env> },
  ) => NoInfer<Session> | null | undefined | Promise<NoInfer<Session> | null | undefined>
  /**
   * Closes what the app opened, such as a database pool (ADR 0069 A1): called by `hozu serve` on SIGTERM / SIGINT and
   * by one-shot CLI commands (`get`, `call`, `browse`, `check`, …) before they exit, with a short timeout.
   */
  dispose?: () => void | Promise<void>
}

export interface App {
  readonly [APP]: AppOptions
}

export interface AppHost {
  env?: Record<string, string | undefined>
  manifest?: Manifest
  render?: RenderModule
  styles?: Stylesheet | null
  components?: ComponentBundle | null
  images?: ImageSet | null
  readFile?: (file: string) => Promise<Uint8Array>
  session?: SessionStore
  dev?: DevOptions
  fetches?: FetchLoader
}

export const app = <Session, Env>(options: AppOptions<Session, Env>): App =>
  Object.freeze({ [APP]: options as AppOptions })

export const appOptionsOf = (value: unknown): AppOptions | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<App>)[APP] ?? null) : null

export const projectOfApp = (a: App): unknown => resolverSetOf(a[APP].resolvers).project

export function appHandlerOptions(a: App, host: AppHost = {}): HandlerOptions {
  const { components: _, dispose: __, ...options } = a[APP]
  const build = buildProject(projectOfApp(a), {
    sources: host.dev !== undefined,
    ...(host.manifest ? { manifest: host.manifest } : {}),
  })
  const dev = host.dev ? { dev: { ...host.dev, app: host.dev.app ?? appModuleOf(projectOfApp(a)) } } : {}
  return { ...options, ...host, ...dev, build }
}
