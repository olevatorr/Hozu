import { readFile, stat } from 'node:fs/promises'
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
import {
  accepts,
  compressedCache,
  compressibleType,
  type Encoding,
  encodingFor,
  streamCompressed,
  varyOn,
} from './compress.ts'

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

const shared = compressedCache()

/**
 * Writes a web Response to Node. With the request, it compresses (ADR 0057 B1): a file that never changes once, kept;
 * a page or JSON answer with gzip, flushed per chunk so streaming keeps its order. Live streams are left alone.
 */
export async function send(
  response: ServerResponse,
  answer: Response,
  request?: IncomingMessage,
  cache: ReturnType<typeof compressedCache> = shared,
): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  answer.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value
  })
  const cookies = answer.headers.getSetCookie()
  if (cookies.length) headers['set-cookie'] = cookies
  const type = answer.headers.get('content-type')
  const control = answer.headers.get('cache-control') ?? ''
  const path = new URL(request?.url ?? '/', 'http://x').pathname
  const shareable =
    request?.method === 'GET' &&
    path.includes('/_hozu/') &&
    /\bimmutable\b/.test(control) &&
    !/\bprivate\b/.test(control) &&
    cookies.length === 0
  const negotiable =
    !!request &&
    answer.status !== 204 &&
    answer.status !== 206 &&
    answer.status !== 304 &&
    compressibleType(type) &&
    !answer.headers.has('content-encoding') &&
    !/\bno-transform\b/.test(control)
  const encoding =
    request && negotiable && answer.body
      ? shareable
        ? encodingFor(request, type)
        : encodingFor(request, type) && (accepts(request, 'gzip') ? 'gzip' : 'br')
      : null
  if (negotiable) headers.vary = varyOn(headers.vary)
  if (encoding) {
    delete headers['content-length']
    headers['content-encoding'] = encoding
  }
  response.writeHead(answer.status, headers)
  if (!answer.body) return void response.end()
  if (encoding && shareable)
    return void response.end(cache(path, encoding, new Uint8Array(await answer.arrayBuffer())))
  const reader = answer.body.getReader()
  if (encoding) return streamCompressed(response, reader, encoding)
  response.on('close', () => void reader.cancel().catch(() => {}))
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    response.write(value)
  }
  response.end()
}

/** `send` that never rejects: a body that fails before its head is a 500, after it the connection is cut. */
export const respond = (
  response: ServerResponse,
  answer: Response,
  request?: IncomingMessage,
): Promise<void> =>
  send(response, answer, request).catch(() => {
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' }).end('Internal error')
    else response.destroy()
  })

/** `hozu build` writes `.br` and `.gz` next to each compressible file; without them, the file is compressed once. */
async function precompressed(file: string, encoding: Encoding, body: Uint8Array) {
  try {
    return await readFile(`${file}.${encoding === 'br' ? 'br' : 'gz'}`)
  } catch {
    const { mtimeMs, size } = await stat(file)
    return shared(`${file}:${mtimeMs}:${size}`, encoding, body)
  }
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
      const file = join(publicDir, path)
      const body = await readFile(file)
      const hashed = /\/_hozu\/(a|w)\/|\/_hozu\/styles\./.test(path)
      const type = contentType(path)
      const encoding = encodingFor(request, type)
      const packed = encoding ? await precompressed(file, encoding, body) : null
      response.writeHead(200, {
        'content-type': type,
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        ...(compressibleType(type) ? { vary: 'Accept-Encoding' } : {}),
        ...(packed ? { 'content-encoding': encoding! } : {}),
      })
      response.end(request.method === 'HEAD' ? undefined : (packed ?? body))
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
    await respond(response, answer, request)
  })
  return Object.assign(server, { revalidate: handler.revalidate, stats: handler.stats })
}
