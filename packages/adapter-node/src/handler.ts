import type { IncomingMessage, ServerResponse } from 'node:http'
import { planRoute } from '@tenon/compiler'
import type { BuildResult, Json } from '@tenon/core/ir'
import { createDataRuntime, type ResolverSet } from '@tenon/data'
import type { EffectResponse, Result } from '@tenon/runtime-client'
import { clientBundle, fnsModule, renderPage, renderToString } from '@tenon/runtime-server'

export interface NodeAdapterOptions {
  build: BuildResult
  resolvers: ResolverSet
  session?: (request: IncomingMessage) => unknown
  now?: () => number
}

interface CachedPage {
  html: string
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
}: NodeAdapterOptions): Handler {
  const data = createDataRuntime({ build, resolvers, now })
  const { ir } = build
  const routes = new Map(Object.entries(ir.routes).map(([id, r]) => [r.path, id]))
  const queries = Object.values(ir.features).flatMap((f) => Object.keys(f.queries).map((q) => `${f.id}.${q}`))
  const cache = new Map<string, CachedPage>()
  const fns = fnsModule(build)

  const ttlOf = (route: string) => {
    const seconds = planRoute(ir, route)
      .plan.regions.map((r) => r.seconds)
      .filter((s): s is number => s !== null)
    return seconds.length ? Math.min(...seconds) * 1000 : Number.POSITIVE_INFINITY
  }

  const generate = async (route: string) => {
    const at = now()
    const { html, tags } = await renderToString({ build, data, route })
    cache.set(route, { html, at, ttl: ttlOf(route), tags, regenerating: null })
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

  const page = async (route: string, request: IncomingMessage, response: ServerResponse) => {
    const headers = { 'content-type': 'text/html; charset=utf-8' }
    if (planRoute(ir, route).plan.cacheable) {
      let cached = cache.get(route)
      let state = 'hit'
      if (!cached) {
        await generate(route)
        cached = cache.get(route)!
        state = 'miss'
      } else if (now() - cached.at >= cached.ttl) {
        state = 'stale'
        const current = cached
        current.regenerating ??= generate(route).catch(() => {
          current.regenerating = null
        })
      }
      response.writeHead(200, { ...headers, 'x-tenon-cache': state }).end(cached.html)
      return
    }
    response.writeHead(200, { ...headers, 'x-tenon-cache': 'bypass' })
    for await (const chunk of renderPage({ build, data, route, session: session(request) }).chunks)
      response.write(chunk)
    response.end()
  }

  const handler = (async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    try {
      if (request.method === 'POST' && url.pathname === '/_tenon/effect')
        return await effect(request, response)
      if (url.pathname === '/_tenon/client.js')
        return void response.writeHead(200, { 'content-type': 'text/javascript' }).end(clientBundle())
      if (url.pathname === '/_tenon/fns.js')
        return void response.writeHead(200, { 'content-type': 'text/javascript' }).end(fns)
      const route = routes.get(url.pathname)
      if (request.method === 'GET' && route && ir.pages[route]) return await page(route, request, response)
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' })
      response.end(error instanceof Error ? error.message : String(error))
    }
  }) as Handler
  handler.revalidate = revalidate
  return handler
}
