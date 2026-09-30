import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { BuildFailed } from './app.ts'
import { appParts } from './request.ts'

export type WorldRequest =
  | { id: number; url: string; method: string; headers: Record<string, string>; body: Uint8Array | null }
  | { cancel: number }

export type WorldReply =
  | { ready: true; cookies: (string | null)[] }
  | { failed: { code: string; message: string; suggestions: string[]; diagnostics?: unknown[] } }
  | { id: number; status: number; headers: [string, string][]; stream: boolean; body?: Uint8Array }
  | { id: number; chunk: string }
  | { id: number; end: true }
  | { id: number; error: string }

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
}

const { config, cwd, sessions } = workerData as {
  config: string | undefined
  cwd: string
  sessions: (string | undefined)[]
}
const port = parentPort!
const post = (reply: WorldReply) => port.postMessage(reply)

try {
  const loaded = await load(config, cwd)
  const parts = await appParts(loaded, 'browse', sessions)
  const root = dirname(loaded.path)
  const build = parts.build as any
  const server = await parts.importFrom<any>('@hozu/runtime-server', ['npm install @hozu/runtime-server'])
  const css = await parts.importFrom<any>('@hozu/css', ['npm install @hozu/css'])
  const styles = await css.compileStyles(build, { base: root })
  const widgets = parts.module.options.widgets ? await parts.module.options.widgets(build) : null
  const handler: { fetch(request: Request): Promise<Response> } = server.createHandler(parts.module.app, {
    styles,
    widgets,
    env: process.env,
    readFile: (file: string) => readFile(file),
    ...(parts.session ? { session: parts.session } : {}),
  })
  const publicDir = join(root, 'public')
  const respond = async (request: Request): Promise<Response> => {
    const response = await handler.fetch(request)
    const file = join(publicDir, decodeURIComponent(new URL(request.url).pathname))
    if (response.status !== 404 || !file.startsWith(publicDir) || !existsSync(file)) return response
    return new Response(await readFile(file).catch(() => null), {
      headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' },
    })
  }
  const streams = new Map<number, ReadableStreamDefaultReader<Uint8Array>>()
  port.on('message', async (message: WorldRequest) => {
    if ('cancel' in message) {
      await streams
        .get(message.cancel)
        ?.cancel()
        .catch(() => {})
      streams.delete(message.cancel)
      return
    }
    const { id, url, method, headers, body } = message
    try {
      const response = await respond(
        new Request(url, {
          method,
          headers,
          ...(body && method !== 'GET' && method !== 'HEAD' ? { body } : {}),
        }),
      )
      const head = [...response.headers].filter(([k]) => k !== 'set-cookie')
      for (const c of response.headers.getSetCookie()) head.push(['set-cookie', c])
      if (!(response.headers.get('content-type') ?? '').startsWith('text/event-stream') || !response.body) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        post({ id, status: response.status, headers: head, stream: false, body: bytes })
        return
      }
      post({ id, status: response.status, headers: head, stream: true })
      const reader = response.body.getReader()
      streams.set(id, reader)
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        post({ id, chunk: decoder.decode(value, { stream: true }) })
      }
      streams.delete(id)
      post({ id, end: true })
    } catch (error) {
      post({ id, error: String(error) })
    }
  })
  post({ ready: true, cookies: parts.cookies })
} catch (error) {
  const e =
    error instanceof HozuCliError
      ? error
      : new HozuCliError('config', error instanceof Error ? error.message : String(error))
  post({
    failed: {
      code: e.code,
      message: e.message,
      suggestions: e.suggestions,
      ...(e instanceof BuildFailed ? { diagnostics: e.diagnostics } : {}),
    },
  })
}
