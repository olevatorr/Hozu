import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'
import { planRoute } from '@tenon/compiler'
import { type BuildResult, FORM_FIELD, type Json, routeTable } from '@tenon/core/ir'
import { createDataRuntime, type OnError, type ResolverSet } from '@tenon/data'
import type { EffectResponse, Result } from '@tenon/runtime-client'
import {
  clientBundle,
  fnsModule,
  inlineScriptHashes,
  matcher,
  pageEntries,
  parseSearch,
  pathOf,
  renderPage,
  renderToString,
  robotsTxt,
  type Stylesheet,
  sitemapXml,
  type WidgetBundle,
} from '@tenon/runtime-server'
import { formFields, formNode, runForm } from './forms.ts'
import { type CspSources, contentSecurityPolicy, crossSite, ERROR_HTML } from './security.ts'
import type { SessionStore } from './session.ts'

export interface NodeAdapterOptions {
  build: BuildResult
  resolvers: ResolverSet
  session?: ((request: IncomingMessage) => unknown) | SessionStore
  now?: () => number
  styles?: Stylesheet | null
  widgets?: WidgetBundle | null
  onError?: OnError
  csp?: CspSources | false
}

interface CachedPage {
  html: string
  status: number
  redirect: string | null
  at: number
  ttl: number
  tags: Set<string>
  regenerating: Promise<void> | null
}

export interface Handler {
  (request: IncomingMessage, response: ServerResponse): Promise<void>
  revalidate(tags: string[]): number
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

const readBytes = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

const readBody = async (request: IncomingMessage) => (await readBytes(request)).toString('utf8')

const readEffect = async (request: IncomingMessage) => {
  const type = request.headers['content-type'] ?? ''
  if (!type.startsWith('multipart/form-data'))
    return { body: await readBody(request), files: new Map<string, File>() }
  const form = await new Response(await readBytes(request), { headers: { 'content-type': type } }).formData()
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
}: NodeAdapterOptions): Handler {
  const store = typeof sessionOption === 'function' ? null : sessionOption
  const session = store
    ? (request: IncomingMessage) => store.read(request)
    : (sessionOption as (r: IncomingMessage) => unknown)
  const assets = {
    client: '/_tenon/client.js',
    fns: '/_tenon/fns.js',
    styles: styles?.href ?? null,
    preload: styles?.preload ?? [],
    widgets: widgets?.urls ?? {},
  }
  const data = createDataRuntime({ build, resolvers, now, onError })
  const secure: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...(csp === false ? {} : { 'content-security-policy': contentSecurityPolicy(csp, inlineScriptHashes) }),
  }
  const { ir } = build
  const match = matcher(build)
  const table = routeTable(ir)
  const queries = Object.values(ir.features).flatMap((f) => Object.keys(f.queries).map((q) => `${f.id}.${q}`))
  const cache = new Map<string, CachedPage>()
  const fns = fnsModule(build)

  const ttlOf = (route: string) => {
    const seconds = planRoute(ir, route)
      .plan.regions.map((r) => r.seconds)
      .filter((s): s is number => s !== null)
    return seconds.length ? Math.min(...seconds) * 1000 : Number.POSITIVE_INFINITY
  }

  const generate = async (path: string, route: string, params: Json, search: Json) => {
    const at = now()
    const { html, tags, status, redirect } = await renderToString({
      build,
      data,
      route,
      params,
      search,
      assets,
    })
    cache.set(path, { html, status, redirect, at, ttl: ttlOf(route), tags, regenerating: null })
  }

  const listeners = new Set<ServerResponse>()
  const revalidate = (tags: string[]) => {
    if (tags.length) for (const res of listeners) res.write(`data: ${JSON.stringify(tags)}\n\n`)
    let count = 0
    for (const [route, page] of cache)
      if (tags.some((t) => page.tags.has(t))) {
        cache.delete(route)
        count++
      }
    data.invalidate(tags)
    return count
  }

  const effect = async (request: IncomingMessage, response: ServerResponse) => {
    const request_ = await readEffect(request)
    const files = request_.files
    const { effect, input, keys } = JSON.parse(request_.body) as {
      effect: string
      input: Json
      keys: string[]
    }
    const who = session(request)
    const result = (await data.run(effect, input, who, files)) as Result & {
      invalidated?: string[]
      session?: unknown
    }
    const invalidated = result.invalidated ?? []
    if (invalidated.length) revalidate(invalidated)
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
    if (store && 'session' in result) store.write(response, result.session)
    const { invalidated: _, session: __, ...plain } = result as typeof result & { session?: unknown }
    const body: EffectResponse = { result: plain as Result, refreshed }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  }

  const page = async (
    path: string,
    route: string,
    params: Json,
    search: Json,
    request: IncomingMessage,
    response: ServerResponse,
    missing = false,
  ) => {
    const headers = { 'content-type': 'text/html; charset=utf-8', ...secure }
    const head = request.method === 'HEAD'
    const statusOf = (s: number) => (missing ? 404 : s)
    if (planRoute(ir, route).plan.cacheable) {
      let cached = cache.get(path)
      let state = 'hit'
      if (!cached) {
        await generate(path, route, params, search)
        cached = cache.get(path)!
        state = 'miss'
      } else if (now() - cached.at >= cached.ttl) {
        state = 'stale'
        const current = cached
        current.regenerating ??= generate(path, route, params, search).catch(() => {
          current.regenerating = null
        })
      }
      if (cached.redirect) return void response.writeHead(303, { location: cached.redirect }).end()
      response.writeHead(statusOf(cached.status), { ...headers, 'x-tenon-cache': state })
      response.end(head ? undefined : cached.html)
      return
    }
    const rendered = await renderPage({
      build,
      data,
      route,
      params,
      search,
      session: session(request),
      assets,
    })
    if (rendered.redirect) return void response.writeHead(303, { location: rendered.redirect }).end()
    response.writeHead(statusOf(rendered.status), { ...headers, 'x-tenon-cache': 'bypass' })
    if (!head) for await (const chunk of rendered.chunks) response.write(chunk)
    response.end()
  }

  const formPost = async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const id = url.searchParams.get(FORM_FIELD)
    const found = match(url.pathname)
    const form = id ? formNode(build, id) : null
    if (!found || !form)
      return void response.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' }).end()
    const query = new URLSearchParams(url.searchParams)
    query.delete(FORM_FIELD)
    const search = parseSearch(ir.routes[found.route]?.search ?? null, query)
    const fields = await formFields(await readBody(request), request.headers['content-type'] ?? '')
    const who = session(request)
    const outcome = await runForm({
      build,
      data,
      routes: table,
      form,
      fields,
      params: found.params,
      search,
      session: who,
    })
    if (!outcome)
      return void response.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' }).end()
    if (outcome.invalidated.length) revalidate(outcome.invalidated)
    if (store && outcome.session) store.write(response, outcome.session.value)
    const back = pathOf(table[found.route] ?? url.pathname, found.params, search)
    const target = outcome.navigate ?? (outcome.unchanged ? back : null)
    if (target) return void response.writeHead(303, { location: target }).end()
    const rendered = await renderPage({
      build,
      data,
      route: found.route,
      params: found.params,
      search,
      snapshots: outcome.snapshots,
      session: who,
      assets,
    })
    response.writeHead(outcome.unexpected ? 500 : rendered.status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...secure,
    })
    for await (const chunk of rendered.chunks) response.write(chunk)
    response.end()
  }

  const files: Record<string, string> = { ...styles?.assets }
  for (const [href, a] of Object.entries(build.bindings.assets)) files[href] = a.file
  const loaded = new Map<string, Buffer>()
  const asset = (href: string) => {
    const file = files[href]
    if (!file) return null
    let body = loaded.get(href)
    if (!body) {
      body = readFileSync(file)
      loaded.set(href, body)
    }
    return body
  }

  const text = (response: ServerResponse, type: string, body: string, head: boolean) =>
    void response.writeHead(200, { 'content-type': type }).end(head ? undefined : body)

  const handler = (async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    try {
      if (request.method === 'POST' && crossSite(request))
        return void response
          .writeHead(403, { 'content-type': 'text/plain' })
          .end('Cross-site request rejected')
      if (request.method === 'POST' && !url.pathname.startsWith('/_tenon/'))
        return await formPost(request, response, url)
      if (request.method === 'POST' && url.pathname === '/_tenon/effect')
        return await effect(request, response)
      if (request.method === 'POST' && url.pathname === '/_tenon/query') {
        const { query, input } = JSON.parse(await readBody(request)) as { query: string; input: Json }
        if (!queries.includes(query))
          return void response.writeHead(400, { 'content-type': 'text/plain' }).end('Unknown query')
        const result = await data.run(query, input, session(request))
        return void response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(result))
      }
      if (url.pathname === '/_tenon/live') {
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        response.write(': live\n\n')
        listeners.add(response)
        request.on('close', () => listeners.delete(response))
        return
      }
      const head = request.method === 'HEAD'
      if (request.method !== 'GET' && !head)
        return void response.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD, POST' }).end()
      const client = clientBundle()[url.pathname]
      if (client !== undefined) return text(response, 'text/javascript', client, head)
      if (url.pathname === '/_tenon/fns.js') return text(response, 'text/javascript', fns, head)
      const file = url.pathname.startsWith('/_tenon/a/') ? asset(url.pathname) : null
      if (file)
        return void response
          .writeHead(200, {
            'content-type': mime[extname(url.pathname)] ?? 'application/octet-stream',
            'cache-control': 'public, max-age=31536000, immutable',
          })
          .end(head ? undefined : file)
      const script = widgets?.files[url.pathname]
      if (script !== undefined)
        return void response
          .writeHead(200, {
            'content-type': 'text/javascript',
            'cache-control': 'public, max-age=31536000, immutable',
          })
          .end(head ? undefined : script)
      if (styles && url.pathname === styles.href)
        return void response
          .writeHead(200, {
            'content-type': 'text/css',
            'cache-control': 'public, max-age=31536000, immutable',
          })
          .end(head ? undefined : styles.css)
      if (url.pathname === '/robots.txt')
        return text(response, 'text/plain; charset=utf-8', robotsTxt(build), head)
      if (url.pathname === '/sitemap.xml')
        return text(response, 'application/xml', sitemapXml(build, await pageEntries(build, data)), head)
      const found = match(url.pathname)
      if (found) {
        const search = parseSearch(ir.routes[found.route]?.search ?? null, url.searchParams)
        const key = pathOf(table[found.route] ?? url.pathname, found.params, search)
        return await page(key, found.route, found.params, search, request, response)
      }
      if (ir.notFound) return await page(`#404`, ir.notFound, null, null, request, response, true)
      response.writeHead(404, { 'content-type': 'text/plain' }).end(head ? undefined : 'Not found')
    } catch (error) {
      onError(error, { path: url.pathname })
      if (response.headersSent) return void response.end()
      if (url.pathname.startsWith('/_tenon/'))
        return void response.writeHead(500, { 'content-type': 'text/plain' }).end('Internal error')
      let html = ERROR_HTML
      if (ir.error)
        try {
          html = (await renderToString({ build, data, route: ir.error, assets })).html
        } catch (again) {
          onError(again, { path: url.pathname })
        }
      response.writeHead(500, { 'content-type': 'text/html; charset=utf-8', ...secure }).end(html)
    }
  }) as Handler
  handler.revalidate = revalidate
  return handler
}
