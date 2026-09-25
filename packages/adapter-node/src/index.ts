import { readFile } from 'node:fs/promises'
import { createServer as http, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createHandler, type Handler, type HandlerOptions } from '@tenon/runtime-server'

export type NodeAdapterOptions = Omit<HandlerOptions, 'readFile'>

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

export function createServer(options: NodeAdapterOptions): Server & Pick<Handler, 'revalidate'> {
  const handler = createHandler({ ...options, readFile: (file) => readFile(file) })
  const server = http(async (request, response) => {
    let answer: Response
    try {
      answer = await handler.fetch(toRequest(request))
    } catch {
      return void response.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request')
    }
    await send(response, answer)
  })
  return Object.assign(server, { revalidate: handler.revalidate })
}
