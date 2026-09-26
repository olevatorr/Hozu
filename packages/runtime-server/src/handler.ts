import { planRoute } from '@tenon/compiler'
import {
  type BuildResult,
  FORM_FIELD,
  hashJson,
  type ImageSet,
  type Json,
  type Manifest,
  publicPath,
  routeParams,
  routePattern,
  routeTable,
} from '@tenon/core/ir'
import { createDataRuntime, type OnError, type ResolverSet } from '@tenon/data'
import { compileValue } from '@tenon/machine'
import type { EffectResponse, Result } from '@tenon/runtime-client'
import { clientBundle } from './assets.ts'
import { type CachedPage, memoryCache, type PageCache } from './cache.ts'
import { pageEntries, robotsTxt, sitemapXml } from './crawl.ts'
import { formFields, formNode, runForm } from './forms.ts'
import { serviceWorker, serviceWorkerRegistration, webManifest } from './pwa.ts'
import {
  fnsModule,
  inlineScriptHashes,
  pathOf,
  renderPage,
  renderToString,
  type Stylesheet,
  type WidgetBundle,
} from './render.ts'
import { matcher } from './routing.ts'
import { parseSearch } from './search.ts'
import { type CspSources, contentSecurityPolicy, crossSite, ERROR_HTML } from './security.ts'
import { type SessionStore, sessionCookie } from './session.ts'
import { publicAssets } from './static.ts'

export interface HandlerOptions {
  build: BuildResult
  resolvers: ResolverSet
  session?: ((request: Request) => unknown) | SessionStore
  now?: () => number
  styles?: Stylesheet | null
  widgets?: WidgetBundle | null
  onError?: OnError
  csp?: CspSources | false
  cache?: PageCache
  readFile?: (file: string) => Promise<Uint8Array>
  manifest?: Manifest
  images?: ImageSet | null
  env?: Record<string, string | undefined>
  preview?: { secret: string; secure?: boolean }
  og?: ((card: OgCard) => Promise<Uint8Array>) | null
}

export interface OgCard {
  title: string
  subtitle: string | null
  siteName: string | null
  themeColor: string | null
}

export interface Handler {
  fetch(request: Request): Promise<Response>
  revalidate(tags: string[]): Promise<number>
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

export function createHandler({
  build,
  resolvers,
  session: sessionOption = () => null,
  now = Date.now,
  styles = null,
  widgets = null,
  onError = (error, info) => console.error('[tenon]', info, error),
  csp = {},
  cache = memoryCache(),
  readFile,
  manifest,
  images = null,
  env: rawEnv = {},
  preview,
  og = null,
}: HandlerOptions): Handler {
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
    ? sessionCookie({
        name: 'tenon_preview',
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
  const variants = manifest?.images ?? images?.variants ?? null
  if (manifest && manifest.irHash !== hashJson(build.ir))
    throw new Error('The build manifest does not match this project; run `tenon build` again')
  const store = typeof sessionOption === 'function' ? null : sessionOption
  const session = store
    ? (request: Request) => store.read(request)
    : async (request: Request) => (sessionOption as (r: Request) => unknown)(request)
  const { ir } = build
  const { basePath, redirects, headers: headerRules } = ir.http
  const assets = manifest
    ? publicAssets(
        basePath,
        manifest.styles,
        Object.fromEntries(Object.entries(manifest.widgets).map(([k, w]) => [k, w.url])),
      )
    : publicAssets(basePath, styles, widgets?.urls ?? {})
  const data = createDataRuntime({ build, resolvers, now, onError, env: rawEnv })
  const previewData: typeof data = {
    ...data,
    run: (ref, input, who, files) => data.run(ref, input, who, files, { preview: true }),
  }
  const dataFor = (request: Request) => (previewing.get(request) ? previewData : data)
  const internal = (path: string | null) => (path?.startsWith('/') && !path.startsWith('//') ? path : null)
  const enterPreview = async (url: URL) => {
    const given = new TextEncoder().encode(url.searchParams.get('secret') ?? '')
    const want = new TextEncoder().encode(preview?.secret ?? '')
    let same = given.length === want.length && want.length > 0
    for (let i = 0; i < want.length; i++) same = same && given[i] === want[i]
    const to = internal(url.searchParams.get('path'))
    if (!previewCookie || !same || !to) return plain(401, 'Invalid preview request')
    return new Response(null, {
      status: 307,
      headers: { location: to, 'set-cookie': await previewCookie.write(true) },
    })
  }
  const exitPreview = async (url: URL) =>
    new Response(null, {
      status: 307,
      headers: {
        location: internal(url.searchParams.get('path')) ?? publicPath(ir, '/'),
        ...(previewCookie ? { 'set-cookie': await previewCookie.write(null) } : {}),
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
            'content-security-policy': contentSecurityPolicy(csp, hashes),
          })))
  const match = matcher(build)
  const table = routeTable(ir)
  const locales = ir.site?.locales ?? null
  const tables = new Map((locales ?? []).map((l) => [l, routeTable(ir, l)]))
  const tableOf = (locale: string | null) => (locale ? (tables.get(locale) ?? table) : table)
  const split = (path: string): { locale: string | null; rest: string } | null => {
    if (!locales) return { locale: null, rest: path }
    const segment = path.split('/')[1] ?? ''
    if (!locales.includes(segment)) return null
    return { locale: segment, rest: path.slice(segment.length + 1) || '/' }
  }
  const negotiate = (request: Request, url: URL, path: string) => {
    const wanted = (request.headers.get('accept-language') ?? '')
      .split(',')
      .map((part) => {
        const [tag = '', q] = part.trim().split(';q=')
        return { tag: tag.toLowerCase(), q: q === undefined ? 1 : Number(q) }
      })
      .filter((w) => w.tag && w.q > 0)
      .sort((a, b) => b.q - a.q)
    const list = locales ?? []
    const best =
      wanted
        .map(
          (w) =>
            list.find((l) => l.toLowerCase() === w.tag) ??
            list.find((l) => l.toLowerCase().split('-')[0] === w.tag.split('-')[0]),
        )
        .find(Boolean) ?? ir.site!.lang
    return new Response(null, {
      status: 307,
      headers: { location: publicPath(ir, path, best) + url.search, vary: 'Accept-Language' },
    })
  }
  const queries = Object.values(ir.features).flatMap((f) => Object.keys(f.queries).map((q) => `${f.id}.${q}`))
  const regenerating = new Map<string, Promise<void>>()
  const fns = fnsModule(build)
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
    return seconds.length ? Math.min(...seconds) * 1000 : Number.POSITIVE_INFINITY
  }

  const generate = async (
    path: string,
    route: string,
    params: Json,
    search: Json,
    locale: string | null,
  ): Promise<CachedPage> => {
    const at = now()
    const { html, tags, status, redirect } = await renderToString({
      build,
      data,
      route,
      params,
      search,
      assets,
      images: variants,
      env: publicEnv,
      locale,
    })
    const page = { html, status, redirect, at, ttl: ttlOf(route), tags: [...tags] }
    await cache.set(path, page)
    return page
  }

  const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const revalidate = async (tags: string[]) => {
    if (tags.length) {
      const message = encoder.encode(`data: ${JSON.stringify(tags)}\n\n`)
      for (const c of listeners) c.enqueue(message)
    }
    data.invalidate(tags)
    return cache.deleteTags(tags)
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
    const who = await session(request)
    const result = (await data.run(effect, input, who, files)) as Result & {
      invalidated?: string[]
      session?: unknown
    }
    const invalidated = result.invalidated ?? []
    if (invalidated.length) await revalidate(invalidated)
    const refreshed: [string, Result][] = []
    if (invalidated.length)
      for (const key of keys) {
        const ref = queries.find(
          (q) => key.startsWith(q) && '{["tfn0123456789-'.includes(key[q.length] ?? ''),
        )
        if (ref)
          refreshed.push([
            key,
            (await data.run(ref, JSON.parse(key.slice(ref.length)) as Json, who)) as Result,
          ])
      }
    const cookie = store && 'session' in result ? await store.write(result.session) : null
    const { invalidated: _, session: __, ...rest } = result as typeof result & { session?: unknown }
    const response: EffectResponse = { result: rest as Result, refreshed }
    return json(response, cookie ? { 'set-cookie': cookie } : {})
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
    if (inPreview) Object.assign(headers, { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' })
    if (!inPreview && planRoute(ir, route).plan.cacheable) {
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
        headers: { ...headers, 'x-tenon-cache': state },
      })
    }
    const rendered = await renderPage({
      build,
      data: dataFor(request),
      route,
      params,
      search,
      session: await session(request),
      assets,
      images: variants,
      env: publicEnv,
      locale,
    })
    if (rendered.redirect) return see(rendered.redirect)
    return new Response(head ? null : stream(rendered.chunks, (e) => onError(e, { path })), {
      status: statusOf(rendered.status),
      headers: { ...headers, 'x-tenon-cache': 'bypass' },
    })
  }

  const formPost = async (request: Request, url: URL, path: string) => {
    const id = url.searchParams.get(FORM_FIELD)
    const where = split(path)
    const found = where ? match(where.rest) : null
    const locale = where?.locale ?? null
    const form = id ? formNode(build, id) : null
    if (!found || !form) return notAllowed()
    const query = new URLSearchParams(url.searchParams)
    query.delete(FORM_FIELD)
    const search = parseSearch(ir.routes[found.route]?.search ?? null, query)
    const fields = await formFields(request)
    const who = await session(request)
    const outcome = await runForm({
      build,
      data,
      routes: tableOf(locale),
      form,
      fields,
      params: found.params,
      search,
      session: who,
    })
    if (!outcome) return notAllowed()
    if (outcome.invalidated.length) await revalidate(outcome.invalidated)
    const cookie = store && outcome.session ? await store.write(outcome.session.value) : null
    const back = pathOf(tableOf(locale)[found.route] ?? url.pathname, found.params, search)
    const target = outcome.navigate ?? (outcome.unchanged ? back : null)
    if (target) return see(target, cookie)
    const rendered = await renderPage({
      build,
      data,
      route: found.route,
      params: found.params,
      search,
      snapshots: outcome.snapshots,
      session: who,
      assets,
      images: variants,
      env: publicEnv,
      locale,
    })
    return new Response(
      stream(rendered.chunks, (e) => onError(e, { path })),
      {
        status: outcome.unexpected ? 500 : rendered.status,
        headers: {
          ...extraHeaders(found.route),
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          ...(cookie ? { 'set-cookie': cookie } : {}),
          ...(await secureHeaders()),
        },
      },
    )
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

  const live = () => {
    let self: ReadableStreamDefaultController<Uint8Array> | null = null
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        self = controller
        listeners.add(controller)
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

  const missing = (request: Request, locale: string | null = null) =>
    ir.notFound
      ? page(`#404:${locale ?? ''}`, ir.notFound, null, null, request, true, locale)
      : plain(404, request.method === 'HEAD' ? null : 'Not found')

  const route = async (request: Request, url: URL, path: string): Promise<Response> => {
    if (request.method === 'POST' && crossSite(request)) return plain(403, 'Cross-site request rejected')
    if (request.method === 'POST' && !path.startsWith('/_tenon/')) return formPost(request, url, path)
    if (request.method === 'POST' && path === '/_tenon/effect') return effect(request)
    if (request.method === 'POST' && path === '/_tenon/query') {
      const { query, input } = (await request.json()) as { query: string; input: Json }
      if (!queries.includes(query)) return plain(400, 'Unknown query')
      return json(await dataFor(request).run(query, input, await session(request)))
    }
    if (path === '/_tenon/live') return live()
    if (path === '/manifest.webmanifest' && manifestText)
      return text('application/manifest+json', manifestText, request.method === 'HEAD')
    if (path === '/sw.js' && worker)
      return text('text/javascript', worker, request.method === 'HEAD', 'no-cache')
    if (path === '/_tenon/sw-register.js' && worker)
      return text('text/javascript', serviceWorkerRegistration(ir), request.method === 'HEAD')
    if (path === '/_tenon/og.png') {
      const png = ogImage(url)
      if (!png) return missing(request)
      return new Response(
        request.method === 'HEAD' ? null : ((await png) as ConstructorParameters<typeof Response>[0]),
        {
          headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE },
        },
      )
    }
    if (path === '/_tenon/preview') return enterPreview(url)
    if (path === '/_tenon/preview/exit') return exitPreview(url)
    const head = request.method === 'HEAD'
    if (request.method !== 'GET' && !head) return plain(405, null, { allow: 'GET, HEAD, POST' })
    const client = clientBundle()[path]
    if (client !== undefined) return text('text/javascript', client, head)
    if (path === '/_tenon/fns.js') return text('text/javascript', fns, head)
    const variant = images?.files[basePath + path]
    if (variant)
      return new Response(head ? null : (variant as ConstructorParameters<typeof Response>[0]), {
        headers: { 'content-type': 'image/webp', 'cache-control': IMMUTABLE },
      })
    const file = path.startsWith('/_tenon/a/') ? asset(basePath + path) : null
    if (file)
      return new Response(head ? null : ((await file) as ConstructorParameters<typeof Response>[0]), {
        headers: {
          'content-type': mime[extension(path)] ?? 'application/octet-stream',
          'cache-control': IMMUTABLE,
        },
      })
    const script = widgets?.files[path]
    if (script !== undefined) return text('text/javascript', script, head, IMMUTABLE)
    if (styles && path === styles.href) return text('text/css', styles.css, head, IMMUTABLE)
    if (path === '/robots.txt') return text('text/plain; charset=utf-8', robotsTxt(build), head)
    if (path === '/sitemap.xml')
      return text('application/xml', sitemapXml(build, await pageEntries(build, data)), head)
    const moved = redirectFor(path, url.search)
    if (moved) return moved
    if (locales && path === '/') return negotiate(request, url, '/')
    const where = split(path)
    if (!where) return match(path) ? negotiate(request, url, path) : missing(request)
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
    async fetch(request) {
      const url = new URL(request.url)
      try {
        if (previewCookie) previewing.set(request, (await previewCookie.read(request)) === true)
        const path = within(url.pathname)
        return path === null ? await missing(request) : await route(request, url, path)
      } catch (error) {
        onError(error, { path: url.pathname })
        if ((within(url.pathname) ?? '').startsWith('/_tenon/')) return plain(500, 'Internal error')
        let html = ERROR_HTML
        if (ir.error)
          try {
            html = (
              await renderToString({ build, data, route: ir.error, assets, images: variants, env: publicEnv })
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
