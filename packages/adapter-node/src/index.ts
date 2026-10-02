import { readFile } from 'node:fs/promises'
import { createServer as http, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join, normalize } from 'node:path'
import { Readable } from 'node:stream'
import {
  type App,
  type AppHost,
  appHandlerOptions,
  appOptionsOf,
  contentType,
  createHandler,
  type Handler,
  type HandlerOptions,
} from '@hozu/runtime-server'

export interface NodeAdapterOptions extends Omit<HandlerOptions, 'readFile'> {
  publicDir?: string
}

export function toRequest(request: IncomingMessage): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers))
    if (value !== undefined) for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
  const body = request.method === 'GET' || request.method === 'HEAD' ? null : Readable.toWeb(request)
  return new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, {
    method: request.method ?? 'GET',
    headers,
    body: body as ReadableStream | null,
    duplex: 'half',
  } as RequestInit)
}

export async function send(response: ServerResponse, answer: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  answer.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value
  })
  const cookies = answer.headers.getSetCookie()
  if (cookies.length) headers['set-cookie'] = cookies
  response.writeHead(answer.status, headers)
  if (!answer.body) return void response.end()
  const reader = answer.body.getReader()
  response.on('close', () => void reader.cancel().catch(() => {}))
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    response.write(value)
  }
  response.end()
}

export function createServer(options: NodeAdapterOptions): Server & Pick<Handler, 'revalidate' | 'stats'>
export function createServer(
  app: App,
  host?: Omit<AppHost, 'readFile'> & { publicDir?: string },
): Server & Pick<Handler, 'revalidate' | 'stats'>
export function createServer(
  first: NodeAdapterOptions | App,
  host: Omit<AppHost, 'readFile'> & { publicDir?: string } = {},
): Server & Pick<Handler, 'revalidate' | 'stats'> {
  const { publicDir: dir, ...appHost } = host
  const options: NodeAdapterOptions = appOptionsOf(first)
    ? { ...appHandlerOptions(first as App, appHost), ...(dir ? { publicDir: dir } : {}) }
    : (first as NodeAdapterOptions)
  const { publicDir, ...rest } = options
  const handler = createHandler({ env: process.env, ...rest, readFile: (file) => readFile(file) })
  const prefix = `${options.build.ir.http.basePath}/_hozu/`
  const serveStatic = async (request: IncomingMessage, response: ServerResponse) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname))
    if (!publicDir || !path.startsWith(prefix) || (request.method !== 'GET' && request.method !== 'HEAD'))
      return false
    try {
      const body = await readFile(join(publicDir, path))
      const hashed = /\/_hozu\/(a|w)\/|\/_hozu\/styles\./.test(path)
      response.writeHead(200, {
        'content-type': contentType(path),
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      response.end(request.method === 'HEAD' ? undefined : body)
      return true
    } catch {
      return false
    }
  }
  const server = http(async (request, response) => {
    if (await serveStatic(request, response)) return
    let answer: Response
    try {
      answer = await handler.fetch(toRequest(request))
    } catch {
      return void response.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request')
    }
    await send(response, answer)
  })
  return Object.assign(server, { revalidate: handler.revalidate, stats: handler.stats })
}
