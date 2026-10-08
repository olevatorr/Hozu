import { planRoute } from '@hozu/compiler'
import type { TagUse } from '@hozu/core'
import {
  type BuildResult,
  canonicalStringify,
  codes,
  componentCatalog,
  type DevOptions,
  type DevPreview,
  type Diagnostic,
  type EndpointIR,
  type FeatureIR,
  FORM_FIELD,
  hashJson,
  type ImageSet,
  type Json,
  join,
  type Manifest,
  pageEffects,
  pageTree,
  publicPath,
  resolveSource,
  routeParams,
  routePattern,
  routeTable,
} from '@hozu/core/ir'
import {
  createDataRuntime,
  type DataCache,
  type FetchLoader,
  type OnError,
  type RequestData,
  type ResolverSet,
} from '@hozu/data'
import { compileValue } from '@hozu/machine'
import type { EffectResponse, Result } from '@hozu/runtime-client'
import { type App, type AppHost, appHandlerOptions, appOptionsOf } from './app.ts'
import { clientBundle, clientVersion } from './assets.ts'
import { type InvalidationBus, localBus } from './bus.ts'
import { type CachedPage, memoryCache, type PageCache } from './cache.ts'
import { assertComponentBundle, assertFetchBundle } from './components.ts'
import { pageEntries, robotsTxt, sitemapXml } from './crawl.ts'
import { implementedAt, projectEndpoints } from './dev-effects.ts'
import { devNode } from './dev-node.ts'
import { traced, traceFetch } from './dev-trace.ts'
import { fnModules } from './fn-modules.ts'
import { endpointForm, formFields, formNode, runForm } from './forms.ts'
import { serviceWorker, serviceWorkerRegistration, webManifest } from './pwa.ts'
import {
  type ComponentBundle,
  inlineScriptHashes,
  pathOf,
  renderPage,
  renderToString,
  type Stylesheet,
} from './render.ts'
import { instantiate, type RenderModule } from './rendered.ts'
import { matcher } from './routing.ts'
import { STATE_FIELD, seal, unseal } from './seal.ts'
import { parseSearch, queryInput } from './search.ts'
import {
  type CspSources,
  connectOrigins,
  contentSecurityPolicy,
  crossSite,
  ERROR_HTML,
  NOT_FOUND_HTML,
  needsJavaScriptHtml,
} from './security.ts'
import { memorySessions, type SessionStore, signedCookie } from './session.ts'
import { renderBuild } from './shared.ts'
import { publicAssets } from './static.ts'

export interface HandlerOptions {
  build: BuildResult
  resolvers: ResolverSet
  session?: ((request: Request) => unknown) | SessionStore
  now?: () => number
  styles?: Stylesheet | null
  components?: ComponentBundle | null
  onError?: OnError
  csp?: CspSources | false
  cache?: PageCache
  /** Public query results (ADR 0050 A); by default `memoryDataCache()`. */
  dataCache?: DataCache
  /** Tells the other instances which tags were invalidated (ADR 0050 B); by default `localBus()`. */
  bus?: InvalidationBus
  /** Seconds after which `'static'` public data and pages are read again, as a safety net when bus messages can be lost; off by default. */
  staticTtl?: number
  readFile?: (file: string) => Promise<Uint8Array>
  manifest?: Manifest
  images?: ImageSet | null
  env?: Record<string, string | undefined>
  preview?: { secret: string; secure?: boolean }
  og?: ((card: OgCard) => Promise<Uint8Array>) | null
  render?: RenderModule
  dev?: DevOptions
  /** How this host loads each feature's fetch.ts for runs: 'either' (ADR 0049); by default `import()` of the file. */
  fetches?: FetchLoader
  /**
   * Runs once per request before any resolver reads the session (ADR 0060 C): a new value replaces it in place,
   * `null` signs out, `undefined` keeps it.
   */
  refreshSession?: (session: never, ctx: { env: never }) => unknown
}

export interface OgCard {
  title: string
  subtitle: string | null
  siteName: string | null
  themeColor: string | null
}

export interface Handler {
  fetch(request: Request): Promise<Response>
  revalidate(tags: TagUse[]): Promise<Revalidated>
  /** Cache sizes and evictions, for monitoring (ADR 0050 A). */
  stats(): ServerStats
}

export interface ServerStats {
  dataEntries: number
  pages: number | null
  evictions: { data: number; pages: number | null }
}

export interface Revalidated {
  entries: number
  pages: number
}

const mime: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
}

const extension = (path: string) => /\.[^./]+$/.exec(path)?.[0].toLowerCase() ?? ''

export const contentType = (path: string): string =>
  ({ '.js': 'text/javascript', '.css': 'text/css', ...mime })[extension(path)] ?? 'application/octet-stream'
const encoder = new TextEncoder()
const IMMUTABLE = 'public, max-age=31536000, immutable'

const stream = (chunks: AsyncIterable<string>, fail: (error: unknown) => void) => {
  const it = chunks[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next()
        if (done) controller.close()
        else controller.enqueue(encoder.encode(value))
      } catch (error) {
        fail(error)
        controller.close()
      }
    },
    async cancel() {
      await it.return?.()
    },
  })
}

const readEffect = async (request: Request) => {
  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data'))
    return { body: await request.text(), files: new Map<string, File>() }
  const form = await request.formData()
  const files = new Map<string, File>()
  for (const [key, value] of form) if (typeof value !== 'string') files.set(key, value)
  return { body: String(form.get('request') ?? '{}'), files }
}

export function createHandler(options: HandlerOptions): Handler
export function createHandler(app: App, host?: AppHost): Handler
export function createHandler(first: HandlerOptions | App, host?: AppHost): Handler {
  return handlerFor(appOptionsOf(first) ? appHandlerOptions(first as App, host) : (first as HandlerOptions))
}

function handlerFor({
  build,
  resolvers,
  session: sessionOption,
  now = Date.now,
  styles = null,
  components = null,
  onError = (error, info) => console.error('[hozu]', info, error),
  csp = {},
  cache = memoryCache(),
  dataCache,
  bus = localBus(),
  staticTtl,
  readFile,
  manifest,
  images = null,
  env: rawEnv = {},
  preview,
  og = null,
  render,
  dev,
  fetches,
  refreshSession,
}: HandlerOptions): Handler {
  const generated = render ? instantiate(render) : undefined
  const cards = new Map<string, Promise<Uint8Array>>()
  const ogImage = (url: URL) => {
    if (!og) return null
    const title = (url.searchParams.get('title') ?? '').slice(0, 120)
    const subtitle = url.searchParams.get('subtitle')?.slice(0, 200) ?? null
    const key = JSON.stringify([title, subtitle])
    let hit = cards.get(key)
    if (!hit) {
      if (cards.size >= 500) cards.clear()
      hit = og({
        title,
        subtitle,
        siteName: build.ir.site?.name ?? null,
        themeColor: build.ir.site?.themeColor ?? null,
      })
      cards.set(key, hit)
    }
    return hit
  }
  if (preview && preview.secret.length < 32) throw new Error('preview.secret must be at least 32 characters')
  const previewCookie = preview
    ? signedCookie({
        name: 'hozu_preview',
        secret: preview.secret,
        maxAge: 60 * 60,
        secure: preview.secure ?? true,
      })
    : null
  const previewing = new WeakMap<Request, boolean>()
  const parsedPublic = build.bindings.env.public?.(rawEnv)
  if (parsedPublic && !parsedPublic.ok)
    throw new Error(`Invalid public environment: ${parsedPublic.issues.join('; ')}`)
  const publicEnv = (parsedPublic?.ok ? parsedPublic.value : {}) as Json
  const connect = connectOrigins(build.ir, publicEnv as Record<string, unknown>)
  const variants = manifest?.images ?? images?.variants ?? null
  if (manifest && manifest.irHash !== hashJson(build.ir))
    throw new Error('The build manifest does not match this project; run `hozu build` again')
  const untransformed = build.diagnostics.find((d) => ['HZ044', 'HZ047', 'HZ059'].includes(d.code))
  if (untransformed) throw new Error(`${untransformed.message}. ${untransformed.fix?.summary ?? ''}`)
  build = renderBuild(withSiteUrl(build, rawEnv))
  const { ir } = build
  if (sessionOption === undefined && ir.session && !rawEnv.SESSION_SECRET && rawEnv.NODE_ENV === 'production')
    throw new Error(
      'This project declares a session: set SESSION_SECRET, or pass createHandler({ session: memorySessions({ secret }) })',
    )
  const store: SessionStore | null =
    typeof sessionOption === 'function'
      ? null
      : (sessionOption ??
        (ir.session
          ? memorySessions({
              secret: rawEnv.SESSION_SECRET,
              secure: rawEnv.SESSION_SECURE
                ? rawEnv.SESSION_SECURE === 'true'
                : rawEnv.NODE_ENV === 'production',
            })
          : null))
  if (refreshSession && !ir.session)
    throw new Error(
      'refreshSession renews a session, and this project declares none: add project({ session })',
    )
  if (refreshSession && !store?.update)
    throw new Error(
      'refreshSession needs a session store with update(request, value), where it keeps the renewed value: memorySessions and kvSessions have one',
    )
  const read = store
    ? (request: Request) => store.read(request)
    : async (request: Request) => (sessionOption as ((r: Request) => unknown) | undefined)?.(request) ?? null
  const serverEnv = (() => {
    const parsed = build.bindings.env.server?.(rawEnv)
    return parsed?.ok ? parsed.value : {}
  })()
  const renewals = new Map<string, { next: Promise<unknown>; until: number }>()
  const renew = (who: unknown, path: string): Promise<unknown> => {
    const key = JSON.stringify(who)
    const at = now()
    for (const [k, r] of renewals) if (r.until < at) renewals.delete(k)
    const known = renewals.get(key)
    if (known) return known.next
    const next = (async () => {
      try {
        const value = await (refreshSession as (s: unknown, c: { env: unknown }) => unknown)(who, {
          env: serverEnv,
        })
        if (value === undefined || value === null) return value
        const issues = build.bindings.checks['#session']?.(value) ?? null
        if (issues)
          throw new Error(`refreshSession returned a value that is not a session: ${issues.join('; ')}`)
        return value
      } catch (error) {
        onError(error, { path })
        return undefined
      }
    })()
    renewals.set(key, { next, until: Number.POSITIVE_INFINITY })
    void next.then(() => {
      const entry = renewals.get(key)
      if (entry) entry.until = now() + 10_000
    })
    return next
  }
  const refreshed = async (request: Request, who: unknown): Promise<unknown> => {
    const next = await renew(who, new URL(request.url).pathname)
    if (next === undefined) return who
    const kept = await store!.update!(request, next)
    return next === null || kept === false ? null : next
  }
  const session = refreshSession
    ? (request: Request) => read(request).then((who) => (who === null ? who : refreshed(request, who)))
    : read
  if (dev) traceFetch()
  const { basePath, redirects, headers: headerRules } = ir.http
  const fnFiles = fnModules(build)
  const fnUrls = Object.fromEntries(Object.entries(fnFiles).map(([name, m]) => [name, m.path]))
  const fnSources = new Map(Object.values(fnFiles).map((m) => [m.path, m.source]))
  const assets = manifest
    ? publicAssets(
        basePath,
        manifest.styles,
        Object.fromEntries(Object.entries(manifest.components).map(([k, c]) => [k, c.url])),
        Object.fromEntries(Object.entries(manifest.fetches ?? {}).map(([k, c]) => [k, c.url])),
        fnUrls,
      )
    : publicAssets(basePath, styles, components?.urls ?? {}, components?.fetches ?? {}, fnUrls)
  assertComponentBundle(ir, assets.components, Boolean(manifest || components))
  assertFetchBundle(ir, assets.fetches ?? {}, Boolean(manifest || components))
  const data = createDataRuntime({
    build,
    resolvers,
    now,
    onError,
    expose: rawEnv.NODE_ENV !== 'production',
    env: rawEnv,
    ...(fetches ? { fetches } : {}),
    ...(dataCache ? { cache: dataCache } : {}),
    ...(staticTtl === undefined ? {} : { staticTtl }),
  })
  const scopes = new WeakMap<Request, Promise<RequestData>>()
  const dataFor = (request: Request) => {
    let scope = scopes.get(request)
    if (!scope) {
      const answers = dev ? previewAnswers(dev, request) : null
      scope = session(request).then((who) => {
        const real = data.scope(who, { preview: previewing.get(request) === true })
        if (!answers) return real
        const run = (ref: string, input: Json, files?: Parameters<typeof real.run>[2], sent?: boolean) =>
          ref in answers ? Promise.resolve(answers[ref] as never) : real.run(ref, input, files, sent)
        return new Proxy(real, {
          get: (target, key) => {
            if (key === 'run') return run
            const value = Reflect.get(target, key, target)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      })
      scopes.set(request, scope)
    }
    return scope
  }
  const hasSession = build.ir.session !== null
  const privately = (read: boolean): Record<string, string> =>
    read ? { 'cache-control': 'private, no-cache', ...(hasSession ? { vary: 'Cookie' } : {}) } : {}
  const internal = (path: string | null) =>
    path && /^\/(?![/\\])/.test(path) && ![...path].some((c) => c < ' ') ? path : null
  const enterPreview = async (url: URL) => {
    const given = new TextEncoder().encode(url.searchParams.get('secret') ?? '')
    const want = new TextEncoder().encode(preview?.secret ?? '')
    let same = given.length === want.length && want.length > 0
    for (let i = 0; i < want.length; i++) same = same && given[i] === want[i]
    const to = internal(url.searchParams.get('path'))
    if (!previewCookie || !same || !to) return plain(401, 'Invalid preview request')
    return new Response(null, {
      status: 307,
      headers: { location: to, 'set-cookie': localCookie(await previewCookie.write(true), url) },
    })
  }
  const exitPreview = async (url: URL) =>
    new Response(null, {
      status: 307,
      headers: {
        location: internal(url.searchParams.get('path')) ?? publicPath(ir, '/'),
        ...(previewCookie ? { 'set-cookie': localCookie(await previewCookie.write(null), url) } : {}),
      },
    })
  const base: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  }
  let secure: Promise<Record<string, string>> | null = null
  const secureHeaders = () =>
    (secure ??=
      csp === false
        ? Promise.resolve(base)
        : inlineScriptHashes(ir).then((hashes) => ({
            ...base,
            'content-security-policy': contentSecurityPolicy(
              { ...csp, connect: [...new Set([...(csp.connect ?? []), ...connect])] },
              hashes,
            ),
          })))
  const match = matcher(build)
  const table = routeTable(ir)
  const locales = ir.site?.locales ?? null
  const tables = new Map((locales ?? []).map((l) => [l, routeTable(ir, l)]))
  const tableOf = (locale: string | null) => (locale ? (tables.get(locale) ?? table) : table)
  const split = (path: string): { locale: string | null; rest: string } => {
    if (!locales) return { locale: null, rest: path }
    const segment = path.split('/')[1] ?? ''
    if (!locales.includes(segment)) return { locale: ir.site!.lang, rest: path }
    return { locale: segment, rest: path.slice(segment.length + 1) || '/' }
  }
  const queries = Object.values(ir.features).flatMap((f) =>
    Object.entries(f.queries)
      .filter(([, q]) => q.runs !== 'browser')
      .map(([q]) => `${f.id}.${q}`),
  )
  /** Effects this server never runs: they use the visitor's browser credentials (ADR 0049). */
  const browserOnly = new Set(
    Object.values(ir.features).flatMap((f) =>
      [...Object.entries(f.queries), ...Object.entries(f.mutations)]
        .filter(([, e]) => e.runs === 'browser')
        .map(([s]) => `${f.id}.${s}`),
    ),
  )
  const serverRun = new Set(
    Object.values(ir.features).flatMap((f) =>
      Object.entries(f.queries)
        .filter(([, q]) => q.runs === 'server')
        .map(([q]) => `${f.id}.${q}`),
    ),
  )
  const perRequest = new Set(
    Object.values(ir.features).flatMap((f) =>
      Object.entries(f.queries)
        .filter(([, q]) => q.freshness.kind === 'request')
        .map(([q]) => `${f.id}.${q}`),
    ),
  )
  const regenerating = new Map<string, Promise<void>>()
  const manifestText = webManifest(ir)
  const worker = serviceWorker(ir, hashJson(ir).slice(0, 12))
  const fnImpls = build.bindings.fns as Record<string, (x: never) => unknown>

  const redirectTable = redirects.map((r) => ({
    ...routePattern(r.from),
    to: compileValue(r.to, fnImpls),
    params: 'link' in r.to ? compileValue(r.to.params, fnImpls) : null,
    target: 'link' in r.to ? r.to.link : null,
    status: r.permanent ? 308 : 307,
  }))

  const redirectFor = (path: string, search: string): Response | null => {
    for (const r of redirectTable) {
      const m = r.pattern.exec(path)
      if (!m) continue
      const params = routeParams(r.keys, m)
      if (!params) return null
      const env = { params, routes: table }
      if (r.target && r.params && build.bindings.checks[`#route:${r.target}`]?.(r.params(env))) return null
      const to = String(r.to(env))
      const location = search ? `${to}${to.includes('?') ? '&' : '?'}${search.slice(1)}` : to
      return new Response(null, { status: r.status, headers: { location } })
    }
    return null
  }

  const extraHeaders = (route: string) => {
    const out: Record<string, string> = {}
    for (const rule of headerRules)
      if (rule.routes === 'all' || rule.routes.includes(route)) Object.assign(out, rule.set)
    return out
  }

  const ttlOf = (route: string) => {
    const seconds = planRoute(ir, route)
      .plan.regions.map((r) => r.seconds)
      .filter((s): s is number => s !== null)
    if (seconds.length) return Math.min(...seconds) * 1000
    return staticTtl === undefined ? Number.POSITIVE_INFINITY : staticTtl * 1000
  }

  const generate = async (
    path: string,
    route: string,
    params: Json,
    search: Json,
    locale: string | null,
  ): Promise<CachedPage> => {
    const at = now()
    const started = epoch
    generating++
    try {
      const { html, tags, status, redirect } = await renderToString({
        build,
        dev: dev !== undefined,
        data,
        route,
        params,
        search,
        assets,
        images: variants,
        ...(generated ? { render: generated } : {}),
        env: publicEnv,
        locale,
      })
      const page = { html, status, redirect, at, ttl: ttlOf(route), tags: [...tags] }
      if (!page.tags.some((t) => (revalidatedAt.get(t) ?? -1) > started)) await cache.set(path, page)
      return page
    } finally {
      if (--generating === 0) revalidatedAt.clear()
    }
  }

  let epoch = 0
  let generating = 0
  const revalidatedAt = new Map<string, number>()
  const dropPages = async (tags: string[]) => {
    if (!tags.length) return 0
    epoch++
    if (generating) for (const t of tags) revalidatedAt.set(t, epoch)
    return cache.deleteTags(tags)
  }
  const listeners = new Map<ReadableStreamDefaultController<Uint8Array>, Set<string>>()
  const broadcast = (tags: string[]) => {
    if (!tags.length) return
    for (const [c, subscribed] of listeners) {
      const mine = tags.filter((t) => subscribed.has(t))
      if (mine.length) c.enqueue(encoder.encode(`data: ${JSON.stringify(mine)}\n\n`))
    }
  }
  const publish = (tags: string[]) => {
    if (!tags.length) return
    Promise.resolve(bus.publish(tags)).catch((error) => onError(error, { path: '/_hozu/invalidate' }))
  }
  const after = (tags: string[]) => {
    if (!tags.length) return
    publish(tags)
    setTimeout(() => broadcast(tags), 0)
  }
  const apply = async (tags: string[]): Promise<Revalidated> => {
    const entries = data.invalidate(tags)
    const pages = await dropPages(tags)
    broadcast(tags)
    return { entries, pages }
  }
  bus.subscribe((tags) => {
    apply(tags).catch((error) => onError(error, { path: '/_hozu/invalidate' }))
  })
  const TAG_USE = Symbol.for('hozu.tagUse')
  const tagKeyOf = (use: TagUse) => {
    const u = (use as unknown as Record<symbol, { tag: object; param: unknown } | undefined>)[TAG_USE]
    const ref = u ? build.bindings.refs.get(u.tag) : undefined
    if (!u || !ref)
      throw new TypeError('revalidate takes tag uses of this project: server.revalidate([notesTag()])')
    const dot = ref.indexOf('.')
    return ir.features[ref.slice(0, dot)]?.tags[ref.slice(dot + 1)]?.param
      ? `${ref}(${canonicalStringify(u.param as Json)})`
      : ref
  }
  const revalidate = async (uses: TagUse[]): Promise<Revalidated> => {
    const tags = [...new Set(uses.map(tagKeyOf))]
    const done = await apply(tags)
    publish(tags)
    return done
  }

  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } })
  const plain = (status: number, body: string | null, headers: Record<string, string> = {}) =>
    new Response(body, { status, headers: { 'content-type': 'text/plain', ...headers } })
  const see = (location: string, cookie: string | null = null) =>
    new Response(null, { status: 303, headers: { location, ...(cookie ? { 'set-cookie': cookie } : {}) } })
  const notAllowed = () => plain(405, null, { allow: 'GET, HEAD' })

  const effect = async (request: Request) => {
    const { body, files } = await readEffect(request)
    const { effect, input, keys } = JSON.parse(body) as { effect: string; input: Json; keys: string[] }
    if (browserOnly.has(effect)) return plain(400, `${effect} runs in the browser; the server never runs it`)
    const scope = await dataFor(request)
    const refreshing = effect === '%refresh'
    const result = (
      refreshing ? { ok: true, value: null } : await scope.run(effect, input, files)
    ) as Result & {
      invalidated?: string[]
      session?: unknown
    }
    const invalidated = result.invalidated ?? []
    await dropPages(invalidated)
    const changed = new Set(refreshing && Array.isArray(input) ? input.map(String) : invalidated)
    const refreshed: [string, Result][] = []
    for (const key of keys) {
      const ref = queries.find((q) => key.startsWith(q) && '{["tfn0123456789-'.includes(key[q.length] ?? ''))
      if (!ref || (refreshing && !serverRun.has(ref))) continue
      const input = JSON.parse(key.slice(ref.length)) as Json
      if ((!refreshing && perRequest.has(ref)) || data.tagsOf(ref, input).some((t) => changed.has(t)))
        refreshed.push([key, (await scope.run(ref, input, undefined, true)) as Result])
    }
    const cookie = store && scope.written ? localCookie(await store.write(scope.written.value, request), request) : null
    const { invalidated: _, session: __, ...rest } = result
    const response: EffectResponse = {
      result: rest as Result,
      refreshed,
      ...(invalidated.length ? { tags: invalidated } : {}),
      ...(scope.written ? { session: true as const } : {}),
    }
    after(invalidated)
    return json(response, { ...privately(true), ...(cookie ? { 'set-cookie': cookie } : {}) })
  }

  const page = async (
    path: string,
    route: string,
    params: Json,
    search: Json,
    request: Request,
    missing: boolean,
    locale: string | null,
  ) => {
    const headers = {
      ...extraHeaders(route),
      'content-type': 'text/html; charset=utf-8',
      ...(await secureHeaders()),
    }
    const head = request.method === 'HEAD'
    const statusOf = (s: number) => (missing ? 404 : s)
    const inPreview = previewing.get(request) === true
    const devState = dev ? devStateOf(request) : null
    const devData = dev ? previewAnswers(dev, request) !== null : false
    const plan = planRoute(ir, route).plan
    if (inPreview || devData)
      Object.assign(headers, { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' })
    else if (plan.cacheable) Object.assign(headers, { 'cache-control': 'public, max-age=0, must-revalidate' })
    else if (plan.regions.some((r) => r.scope === 'user')) Object.assign(headers, privately(true))
    else Object.assign(headers, { 'cache-control': 'no-cache' })
    if (!inPreview && !devState && !devData && plan.cacheable) {
      let cached = await cache.get(path)
      let state = 'hit'
      if (!cached) {
        cached = await generate(path, route, params, search, locale)
        state = 'miss'
      } else if (now() - cached.at >= cached.ttl) {
        state = 'stale'
        if (!regenerating.has(path))
          regenerating.set(
            path,
            generate(path, route, params, search, locale)
              .then(
                () => undefined,
                () => undefined,
              )
              .finally(() => regenerating.delete(path)),
          )
      }
      if (cached.redirect) return see(cached.redirect)
      return new Response(head ? null : cached.html, {
        status: statusOf(cached.status),
        headers: { ...headers, 'x-hozu-cache': state },
      })
    }
    const rendered = await renderPage({
      build,
      dev: dev !== undefined,
      devState,
      data,
      scope: await dataFor(request),
      route,
      params,
      search,
      assets,
      images: variants,
      ...(generated ? { render: generated } : {}),
      env: publicEnv,
      locale,
    })
    if (rendered.redirect) return see(rendered.redirect)
    return new Response(head ? null : stream(rendered.chunks, (e) => onError(e, { path })), {
      status: statusOf(rendered.status),
      headers: { ...headers, 'x-hozu-cache': 'bypass' },
    })
  }

  const formPost = async (request: Request, url: URL, path: string) => {
    const id = url.searchParams.get(FORM_FIELD)
    const where = split(path)
    const found = match(where.rest)
    const locale = where.locale
    const form = id ? formNode(build, id) : null
    if (!found || !form) return notAllowed()
    const query = new URLSearchParams(url.searchParams)
    query.delete(FORM_FIELD)
    const search = parseSearch(ir.routes[found.route]?.search ?? null, query)
    const fields = await formFields(request)
    const scope = await dataFor(request)
    const owner = form.on.submit!.event.slice(0, form.on.submit!.event.indexOf('.'))
    const bindTo = (feature: string, session: unknown) =>
      hashJson({ machine: ir.features[feature]?.machine ?? null, session: session ?? null } as never)
    const kept = await unseal(
      rawEnv.SESSION_SECRET,
      owner,
      bindTo(owner, scope.session),
      fields.first[STATE_FIELD],
    )
    const start = kept && !build.bindings.checks[`${owner}#context`]?.(kept.context) ? kept : null
    const outcome = await runForm({
      start,
      build,
      data: scope,
      routes: tableOf(locale),
      form,
      fields,
      route: found.route,
      params: found.params,
      search,
    })
    if (!outcome) return notAllowed()
    const back = pathOf(tableOf(locale)[found.route] ?? url.pathname, found.params, search)
    if (outcome.needsBrowser)
      return new Response(needsJavaScriptHtml(outcome.needsBrowser, back), {
        status: 400,
        headers: { 'content-type': 'text/html; charset=utf-8', ...(await secureHeaders()) },
      })
    await dropPages(outcome.invalidated)
    const cookie = store && outcome.session ? localCookie(await store.write(outcome.session.value, request), request) : null
    const target = outcome.invalid
      ? null
      : (outcome.navigate ?? outcome.replace ?? (outcome.unchanged ? back : null))
    if (target) {
      after(outcome.invalidated)
      return see(target, cookie)
    }
    const sealed: Record<string, string> = {}
    const now = outcome.session ? outcome.session.value : scope.session
    for (const [f, snap] of Object.entries(outcome.snapshots)) {
      const token = await seal(rawEnv.SESSION_SECRET, f, bindTo(f, now), snap)
      if (token) sealed[f] = token
      else
        onError(
          new Error(`${f}: the state is too large to carry in a form; a native post starts this form over`),
          { path },
        )
    }
    const rendered = await renderPage({
      build,
      dev: dev !== undefined,
      data,
      scope,
      route: found.route,
      params: found.params,
      search,
      snapshots: outcome.snapshots,
      sealed,
      assets,
      images: variants,
      ...(generated ? { render: generated } : {}),
      env: publicEnv,
      locale,
    })
    if (rendered.redirect && !outcome.unexpected && !outcome.invalid) {
      after(outcome.invalidated)
      return see(rendered.redirect, cookie)
    }
    const response = new Response(
      stream(rendered.chunks, (e) => onError(e, { path })),
      {
        status: outcome.unexpected ? 500 : outcome.invalid ? 400 : rendered.status,
        headers: {
          ...extraHeaders(found.route),
          'content-type': 'text/html; charset=utf-8',
          ...privately(true),
          ...(cookie ? { 'set-cookie': cookie } : {}),
          ...(await secureHeaders()),
        },
      },
    )
    after(outcome.invalidated)
    return response
  }

  const files: Record<string, string> = {}
  for (const [href, file] of Object.entries(styles?.assets ?? {})) files[basePath + href] = file
  for (const [href, a] of Object.entries(build.bindings.assets)) if (a.file) files[href] = a.file
  const loaded = new Map<string, Promise<Uint8Array>>()
  const asset = (href: string) => {
    const file = files[href]
    if (!file || !readFile) return null
    let body = loaded.get(href)
    if (!body) {
      body = readFile(file)
      loaded.set(href, body)
    }
    return body
  }

  const text = (type: string, body: string, head: boolean, cacheControl?: string) =>
    new Response(head ? null : body, {
      headers: { 'content-type': type, ...(cacheControl ? { 'cache-control': cacheControl } : {}) },
    })

  const live = (url: URL) => {
    let self: ReadableStreamDefaultController<Uint8Array> | null = null
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        self = controller
        listeners.set(controller, new Set(url.searchParams.getAll('tag')))
        controller.enqueue(encoder.encode(': live\n\n'))
      },
      cancel() {
        if (self) listeners.delete(self)
      },
    })
    return new Response(body, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    })
  }

  const missing = async (request: Request, locale: string | null = null) =>
    ir.notFound
      ? page(`#404:${locale ?? ''}`, ir.notFound, null, null, request, true, locale)
      : new Response(request.method === 'HEAD' ? null : NOT_FOUND_HTML, {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8', ...(await secureHeaders()) },
        })

  const endpointRefs = new Map<string, string>(
    Object.values(ir.features).flatMap((f) =>
      Object.entries(f.endpoints ?? {}).map(
        ([symbol, e]) => [`${e.method} ${e.path}`, `${f.id}.${symbol}`] as const,
      ),
    ),
  )

  const LINK = Symbol.for('hozu.link')
  const locationOf = (href: unknown): string | null => {
    const l = (href as Record<symbol, { route: object; params: Json; search: Json }> | null)?.[LINK]
    const ref = l ? build.bindings.refs.get(l.route) : undefined
    return ref?.startsWith('#route:') ? pathOf(table[ref.slice(7)] ?? '/', l!.params, l!.search) : null
  }

  const endpointIRs = new Map(
    Object.values(ir.features).flatMap((f) =>
      Object.entries(f.endpoints).map(
        ([sym, e]): [string, { feature: FeatureIR; sym: string; e: EndpointIR }] => [
          `${f.id}.${sym}`,
          { feature: f, sym, e },
        ],
      ),
    ),
  )

  const htmlFromEndpoint = (ref: string) => {
    const { feature, sym } = endpointIRs.get(ref)!
    const pointer = join('', 'features', feature.id, 'endpoints', sym)
    const diagnostic: Diagnostic = {
      code: 'HZ053',
      severity: codes.HZ053.severity,
      message: `Endpoint ${ref} answered text/html`,
      location: { feature: feature.id, pointer, source: resolveSource(build.sources, pointer) },
      cause:
        'A page is rendered from the IR, with its CSP, headers, lang and view-transition opt-in; HTML from an endpoint has none of them. The framework answers 500 instead.',
      fix: {
        summary: 'Render it as a ui.page, and answer 403 / 404 / 410 or redirect through head.failed',
        snippet: `ui.page(route, { views: [...], head: { query, input, render, failed: { Forbidden: 403 } } })`,
        patch: null,
      },
    }
    return Object.assign(new Error(`HZ053 ${diagnostic.message}. ${diagnostic.fix!.summary}`), { diagnostic })
  }

  const endpointCall = async (request: Request, url: URL, ref: string) => {
    const { feature, e } = endpointIRs.get(ref)!
    let input: Json = null
    let bytes: Uint8Array | undefined
    if (e.raw) bytes = new Uint8Array(await request.arrayBuffer())
    else if (request.method !== 'POST') input = queryInput(feature.schemas[e.input] ?? null, url.searchParams)
    else if ((request.headers.get('content-type') ?? '').includes('json'))
      input = (await request.json().catch(() => null)) as Json
    else input = await endpointForm(feature.schemas[e.input] ?? null, request).catch(() => null)
    const scope = await dataFor(request)
    const result = await scope.endpoint(ref, input, { request, ...(bytes ? { bytes } : {}) })
    const cookie = store && scope.written ? localCookie(await store.write(scope.written.value, request), request) : null
    const finish = (response: Response) => {
      const out = new Response(response.body, response)
      for (const [k, v] of Object.entries(base)) if (!out.headers.has(k)) out.headers.set(k, v)
      if (cookie) out.headers.append('set-cookie', cookie)
      if (!out.headers.has('cache-control'))
        for (const [k, v] of Object.entries(privately(scope.readSession))) out.headers.set(k, v)
      return out
    }
    if (!result.ok)
      return finish(
        new Response(
          JSON.stringify({
            ...result.data,
            error: result.error,
            message: result.message,
            ...(result.fields ? { fields: result.fields } : {}),
          }),
          { status: result.status, headers: { 'content-type': 'application/json' } },
        ),
      )
    await dropPages(result.invalidated)
    let response: Response
    const to = result.redirect === undefined ? null : locationOf(result.redirect)
    if (result.redirect !== undefined && !to) {
      onError(new Error(`${ref} returned redirect() of something that is not ui.link(route, …)`), {
        path: url.pathname,
      })
      response = plain(500, 'Internal error')
    } else if (to) response = see(to)
    else if (result.value instanceof Response) {
      if ((result.value.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
        const error = htmlFromEndpoint(ref)
        onError(error, { path: url.pathname })
        response = plain(500, error.message)
      } else response = result.value
    } else response = json(result.value)
    const out = finish(response)
    after(result.invalidated)
    return out
  }

  const route = async (request: Request, url: URL, path: string): Promise<Response> => {
    if (path === '/_hozu/invalidate' && bus.accept) return bus.accept(request)
    if (request.method === 'POST' && crossSite(request)) return plain(403, 'Cross-site request rejected')
    const endpointRef = endpointRefs.get(`${request.method === 'HEAD' ? 'GET' : request.method} ${path}`)
    if (endpointRef) return endpointCall(request, url, endpointRef)
    if (request.method === 'POST' && !path.startsWith('/_hozu/')) return formPost(request, url, path)
    if (request.method === 'POST' && path === '/_hozu/effect') return effect(request)
    if (request.method === 'POST' && path === '/_hozu/query') {
      const { query, input } = (await request.json()) as { query: string; input: Json }
      if (browserOnly.has(query)) return plain(400, `${query} runs in the browser; the server never runs it`)
      if (!queries.includes(query)) return plain(400, 'Unknown query')
      const scope = await dataFor(request)
      const result = await scope.run(query, input, undefined, true)
      return json(result, privately(scope.readSession))
    }
    if (
      dev &&
      (path === '/_hozu/dev/node' ||
        path === '/_hozu/dev/page' ||
        path === '/_hozu/dev/styles' ||
        path === '/_hozu/dev/tree' ||
        path === '/_hozu/dev/effects' ||
        path === '/_hozu/dev/trace' ||
        path === '/_hozu/dev/endpoints' ||
        path === '/_hozu/dev/session' ||
        path === '/_hozu/dev/components' ||
        path === '/_hozu/dev/component' ||
        path === '/_hozu/dev/previews')
    ) {
      if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname))
        return new Response('Hozu DevTools answers only this machine', { status: 403 })
      const devJson = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
        new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init.headers },
        })
      if (path === '/_hozu/dev/trace') {
        const after = url.searchParams.get('after')
        return devJson(traced(after === 'latest' ? Number.POSITIVE_INFINITY : Number(after ?? 0)))
      }
      if (path === '/_hozu/dev/endpoints') return devJson(projectEndpoints(ir))
      if (path === '/_hozu/dev/components')
        return devJson(
          componentCatalog(build, dev).map((c) => ({ ...c, previews: dev.previews?.components[c.id] ?? [] })),
        )
      if (path === '/_hozu/dev/component') {
        const id = url.searchParams.get('id') ?? ''
        const entry = componentCatalog(build, dev).find((c) => c.id === id)
        if (!entry) return devJson({ error: `No component ${id}` }, { status: 404 })
        if (!dev.render) return devJson({ error: 'Rendering needs hozu dev' }, { status: 501 })
        let use: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(url.searchParams.get('use') ?? '{}') as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            use = parsed as Record<string, unknown>
        } catch {}
        const props = (use.props ?? entry.example) as Record<string, unknown>
        return devJson(
          await dev.render(id, {
            variant: (use.variant ?? {}) as Record<string, string>,
            props: props && typeof props === 'object' ? props : {},
            slots: (use.slots ?? {}) as Record<string, string>,
            ...(typeof use.children === 'string' ? { children: use.children } : {}),
          }),
        )
      }
      if (path === '/_hozu/dev/previews' && !url.searchParams.has('path'))
        return devJson({
          pages: Object.entries(dev.previews?.pages ?? {}).map(([route, list]) => ({
            route,
            path: publicPath(ir, ir.routes[route]?.path ?? '/'),
            previews: list.map((p) => ({ name: p.name })),
          })),
          current: previewNameOf(request),
        })
      if (path === '/_hozu/dev/previews') {
        const found = match(split(url.searchParams.get('path') ?? '/').rest)
        const list = found ? (dev.previews?.pages[found.route] ?? []) : []
        return devJson({
          route: found?.route ?? null,
          previews: list.map((p) => ({ name: p.name, queries: Object.keys(p.data) })),
          current: previewNameOf(request),
        })
      }
      if (path === '/_hozu/dev/session') {
        if (!store || !ir.session) return devJson({ declared: false, schema: null, current: null })
        if (request.method === 'POST') {
          const { session: value } = (await request.json()) as { session: unknown }
          const issues = value === null ? null : (build.bindings.checks['#session']?.(value) ?? null)
          if (issues) return devJson({ error: issues.join('; ') }, { status: 400 })
          const cookie = localCookie(await store.write(value, request), request)
          return devJson({ current: value }, { headers: { 'set-cookie': cookie } })
        }
        return devJson({
          declared: true,
          schema: ir.session,
          current: await store.read(request),
        })
      }
      if (path === '/_hozu/dev/tree' || path === '/_hozu/dev/effects') {
        const found = match(split(url.searchParams.get('path') ?? '/').rest)
        const tree = found
          ? path === '/_hozu/dev/tree'
            ? pageTree(build, found.route)
            : await implementedAt(pageEffects(build, found.route), dev, build.bindings.fetches, readFile)
          : null
        return new Response(JSON.stringify(tree), {
          status: tree ? 200 : 404,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      }
      if (path === '/_hozu/dev/styles') {
        const entry = build.bindings.styles.entry
        const css =
          entry && readFile
            ? new TextDecoder().decode(await readFile(entry).catch(() => new Uint8Array()))
            : ''
        return new Response(css, { headers: { 'content-type': 'text/css', 'cache-control': 'no-store' } })
      }
      const page =
        path === '/_hozu/dev/page' ? match(split(url.searchParams.get('path') ?? '/').rest)?.route : null
      const id =
        path === '/_hozu/dev/page' ? (page ? `page:${page}` : '') : (url.searchParams.get('id') ?? '')
      const found = await devNode(build, id, dev, readFile)
      return new Response(JSON.stringify(found), {
        status: found ? 200 : 404,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }
    if (path === '/_hozu/live') return live(url)
    if (path === '/manifest.webmanifest' && manifestText)
      return text('application/manifest+json', manifestText, request.method === 'HEAD')
    if (path === '/sw.js' && worker)
      return text('text/javascript', worker, request.method === 'HEAD', 'no-cache')
    if (path === '/_hozu/sw-register.js' && worker)
      return text('text/javascript', serviceWorkerRegistration(ir), request.method === 'HEAD')
    if (path === '/_hozu/og.png') {
      const png = ogImage(url)
      if (!png) return missing(request)
      return new Response(
        request.method === 'HEAD' ? null : ((await png) as ConstructorParameters<typeof Response>[0]),
        {
          headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE },
        },
      )
    }
    if (path === '/_hozu/preview') return enterPreview(url)
    if (path === '/_hozu/preview/exit') return exitPreview(url)
    const head = request.method === 'HEAD'
    if (request.method !== 'GET' && !head) return plain(405, null, { allow: 'GET, HEAD, POST' })
    const client = clientBundle()[path]
    if (client !== undefined)
      return text(
        'text/javascript',
        client,
        head,
        path.endsWith('/client.js')
          ? url.searchParams.get('v') === clientVersion()
            ? IMMUTABLE
            : 'no-cache'
          : IMMUTABLE,
      )
    const fnSource = fnSources.get(path)
    if (fnSource !== undefined) return text('text/javascript', fnSource, head, IMMUTABLE)
    const variant = images?.files[basePath + path]
    if (variant)
      return new Response(head ? null : (variant as ConstructorParameters<typeof Response>[0]), {
        headers: { 'content-type': 'image/webp', 'cache-control': IMMUTABLE },
      })
    const file = path.startsWith('/_hozu/a/') ? asset(basePath + path) : null
    if (file)
      return new Response(head ? null : ((await file) as ConstructorParameters<typeof Response>[0]), {
        headers: {
          'content-type': mime[extension(path)] ?? 'application/octet-stream',
          'cache-control': IMMUTABLE,
        },
      })
    const script = components?.files[path]
    if (script !== undefined) return text('text/javascript', script, head, IMMUTABLE)
    if (styles && path === styles.href) return text('text/css', styles.css, head, IMMUTABLE)
    if (path === '/robots.txt') return text('text/plain; charset=utf-8', robotsTxt(build), head)
    if (path === '/sitemap.xml')
      return text('application/xml', sitemapXml(build, await pageEntries(build, data)), head)
    const moved = redirectFor(path, url.search)
    if (moved) return moved
    const where = split(path)
    const found = match(where.rest)
    if (!found) return missing(request, where.locale)
    const canonical = publicPath(ir, where.rest, where.locale)
    if (canonical !== url.pathname)
      return new Response(null, { status: 308, headers: { location: canonical + url.search } })
    const search = parseSearch(ir.routes[found.route]?.search ?? null, url.searchParams)
    const key = pathOf(tableOf(where.locale)[found.route] ?? url.pathname, found.params, search)
    return page(key, found.route, found.params, search, request, false, where.locale)
  }

  const within = (pathname: string): string | null => {
    if (!basePath) return pathname
    if (pathname === basePath) return '/'
    return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : null
  }

  return {
    revalidate,
    stats: () => {
      const d = data.stats()
      return {
        dataEntries: d.entries,
        pages: cache.size ?? null,
        evictions: { data: d.evictions, pages: cache.evictions ?? null },
      }
    },
    async fetch(request) {
      const url = new URL(request.url)
      try {
        if (previewCookie) previewing.set(request, (await previewCookie.read(request)) === true)
        const path = within(url.pathname)
        return path === null ? await missing(request) : await route(request, url, path)
      } catch (error) {
        onError(error, { path: url.pathname })
        if ((within(url.pathname) ?? '').startsWith('/_hozu/')) return plain(500, 'Internal error')
        let html = ERROR_HTML
        if (ir.error)
          try {
            html = (
              await renderToString({
                build,
                dev: dev !== undefined,
                data,
                route: ir.error,
                assets,
                images: variants,
                env: publicEnv,
                ...(generated ? { render: generated } : {}),
              })
            ).html
          } catch (again) {
            onError(again, { path: url.pathname })
          }
        return new Response(html, {
          status: 500,
          headers: { 'content-type': 'text/html; charset=utf-8', ...(await secureHeaders()) },
        })
      }
    },
  }
}

const previewNameOf = (request: Request): string | null => {
  const raw = /(?:^|;\s*)hozu-dev-preview=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]
  try {
    return raw ? decodeURIComponent(raw) : null
  } catch {
    return null
  }
}

/** Under `hozu dev` only: the query results of the page preview the DevTools cookie names (ADR 0058 H). */
function previewAnswers(dev: DevOptions, request: Request): Record<string, Json> | null {
  const name = previewNameOf(request)
  if (!name || !dev.previews) return null
  const at = name.indexOf(':')
  const found = dev.previews.pages[name.slice(0, at)]?.find((p) => p.name === name.slice(at + 1))
  return found ? found.data : null
}

function devStateOf(request: Request): DevPreview | null {
  const raw = /(?:^|;\s*)hozu-dev-state=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]
  if (!raw) return null
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
    if (typeof v.query === 'string' && typeof v.branch === 'string')
      return { query: v.query, branch: v.branch }
    if (typeof v.feature === 'string' && typeof v.state === 'string')
      return v.context && typeof v.context === 'object' && !Array.isArray(v.context)
        ? { feature: v.feature, state: v.state, context: v.context as { [key: string]: Json } }
        : { feature: v.feature, state: v.state }
  } catch {}
  return null
}

/** `site.url: { env }` (ADR 0057 A2): the origin comes from that variable at startup; a missing or bad one stops it. */
export function withSiteUrl(build: BuildResult, env: Record<string, string | undefined>): BuildResult {
  const site = build.ir.site
  if (!site?.urlEnv) return build
  const raw = env[site.urlEnv]?.trim() ?? ''
  let url: URL | null = null
  try {
    url = raw ? new URL(raw) : null
  } catch {}
  if (!url || !/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash)
    throw new Error(
      `site.url reads ${site.urlEnv}, which must be set to an origin such as https://example.org (got ${raw ? JSON.stringify(raw) : 'nothing'})`,
    )
  return { ...build, ir: { ...build.ir, site: { ...site, url: url.origin } } }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Safari keeps no `Secure` cookie over plain HTTP, even on this machine: `hozu serve` on 127.0.0.1 signed nobody in. */
export function localCookie(cookie: string, at: Request | URL): string {
  const url = at instanceof URL ? at : new URL(at.url)
  return url.protocol === 'http:' && LOOPBACK.has(url.hostname) ? cookie.replace(/; Secure(?=;|$)/, '') : cookie
}
