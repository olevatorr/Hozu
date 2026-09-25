import type { IncomingMessage, ServerResponse } from 'node:http'
import { planRoute } from '@tenon/compiler'
import type { BuildResult, Json } from '@tenon/core/ir'
import { createDataRuntime, type ResolverSet } from '@tenon/data'
import type { EffectResponse, Result } from '@tenon/runtime-client'
import {
  clientBundle,
  fnsModule,
  matcher,
  pageEntries,
  renderPage,
  renderToString,
  robotsTxt,
  type Stylesheet,
  sitemapXml,
} from '@tenon/runtime-server'

export interface NodeAdapterOptions {
  build: BuildResult
  resolvers: ResolverSet
  session?: (request: IncomingMessage) => unknown
  now?: () => number
  styles?: Stylesheet | null
}

interface CachedPage {
  html: string
  status: number
  at: number
  ttl: number
  tags: Set<string>
  regenerating: Promise<void> | null
}

export interface Handler {
  (request: IncomingMessage, response: ServerResponse): Promise<void>
  revalidate(tags: string[]): number
}

const readBody = async (request: IncomingMessage) => {
  let body = ''
  for await (const chunk of request) body += chunk
  return body
}

export function createHandler({
  build,
  resolvers,
  session = () => null,
  now = Date.now,
  styles = null,
}: NodeAdapterOptions): Handler {
  const assets = { client: '/_tenon/client.js', fns: '/_tenon/fns.js', styles: styles?.href ?? null }
  const data = createDataRuntime({ build, resolvers, now })
  const { ir } = build
  const match = matcher(build)
  const queries = Object.values(ir.features).flatMap((f) => Object.keys(f.queries).map((q) => `${f.id}.${q}`))
  const cache = new Map<string, CachedPage>()
  const fns = fnsModule(build)

  const ttlOf = (route: string) => {
    const seconds = planRoute(ir, route)
      .plan.regions.map((r) => r.seconds)
      .filter((s): s is number => s !== null)
    return seconds.length ? Math.min(...seconds) * 1000 : Number.POSITIVE_INFINITY
  }

  const generate = async (path: string, route: string, params: Json) => {
    const at = now()
    const { html, tags, status } = await renderToString({ build, data, route, params, assets })
    cache.set(path, { html, status, at, ttl: ttlOf(route), tags, regenerating: null })
  }

  const revalidate = (tags: string[]) => {
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
    const { effect, input, keys } = JSON.parse(await readBody(request)) as {
      effect: string
      input: Json
      keys: string[]
    }
    const who = session(request)
    const result = (await data.run(effect, input, who)) as Result & { invalidated?: string[] }
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
    const { invalidated: _, ...plain } = result
    const body: EffectResponse = { result: plain as Result, refreshed }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  }

  const page = async (
    path: string,
    route: string,
    params: Json,
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const headers = { 'content-type': 'text/html; charset=utf-8' }
    const head = request.method === 'HEAD'
    if (planRoute(ir, route).plan.cacheable) {
      let cached = cache.get(path)
      let state = 'hit'
      if (!cached) {
        await generate(path, route, params)
        cached = cache.get(path)!
        state = 'miss'
      } else if (now() - cached.at >= cached.ttl) {
        state = 'stale'
        const current = cached
        current.regenerating ??= generate(path, route, params).catch(() => {
          current.regenerating = null
        })
      }
      response.writeHead(cached.status, { ...headers, 'x-tenon-cache': state })
      response.end(head ? undefined : cached.html)
      return
    }
    const rendered = await renderPage({ build, data, route, params, session: session(request), assets })
    response.writeHead(rendered.status, { ...headers, 'x-tenon-cache': 'bypass' })
    if (!head) for await (const chunk of rendered.chunks) response.write(chunk)
    response.end()
  }

  const text = (response: ServerResponse, type: string, body: string, head: boolean) =>
    void response.writeHead(200, { 'content-type': type }).end(head ? undefined : body)

  const handler = (async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    try {
      if (request.method === 'POST' && url.pathname === '/_tenon/effect')
        return await effect(request, response)
      const head = request.method === 'HEAD'
      if (request.method !== 'GET' && !head)
        return void response.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD, POST' }).end()
      if (url.pathname === '/_tenon/client.js') return text(response, 'text/javascript', clientBundle(), head)
      if (url.pathname === '/_tenon/fns.js') return text(response, 'text/javascript', fns, head)
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
      if (found) return await page(url.pathname, found.route, found.params, request, response)
      response.writeHead(404, { 'content-type': 'text/plain' }).end(head ? undefined : 'Not found')
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' })
      response.end(error instanceof Error ? error.message : String(error))
    }
  }) as Handler
  handler.revalidate = revalidate
  return handler
}
