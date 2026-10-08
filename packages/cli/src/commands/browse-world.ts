import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'
import type { ServerError } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { BuildFailed } from './app.ts'
import { appParts, collectingErrors } from './request.ts'

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
  | { serverError: ServerError }

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

const { config, cwd, sessions, built } = workerData as {
  config: string | undefined
  cwd: string
  sessions: (string | undefined)[]
  built: string | null
}

/** The entry `hozu build --target` wrote, with the platform's static files served first (ADR 0073 A3). */
async function builtHandler(
  dir: string,
  kv: Map<string, string>,
): Promise<{ fetch(request: Request): Promise<Response> }> {
  const workers = existsSync(join(dir, 'wrangler.jsonc'))
  const assets = join(dir, workers ? 'assets' : 'static')
  const entry = join(dir, workers ? 'worker.mjs' : 'functions/index.func/index.js')
  if (!existsSync(entry))
    throw new Error(
      `${dir} has no ${workers ? 'worker.mjs' : 'functions/index.func/index.js'}: run hozu build --target workers | vercel`,
    )
  const mod = (await import(pathToFileURL(entry).href)) as { default: any }
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    SESSIONS: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    },
  }
  return {
    async fetch(request) {
      let path = ''
      try {
        path = decodeURIComponent(new URL(request.url).pathname)
      } catch {}
      const file = join(assets, path)
      if (
        request.method === 'GET' &&
        path &&
        file.startsWith(`${assets}/`) &&
        existsSync(file) &&
        !path.endsWith('/')
      )
        return new Response(await readFile(file), {
          headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' },
        })
      return workers ? mod.default.fetch(request, env) : mod.default(request)
    },
  }
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
  const components = parts.module.options.components ? await parts.module.options.components(build) : null
  const kv = new Map<string, string>()
  if (
    built &&
    sessions.some((j) => j !== undefined) &&
    (!process.env.SESSION_SECRET || !existsSync(join(built, 'wrangler.jsonc')))
  )
    throw new HozuCliError(
      'usage',
      '--session with --build signs in through a Workers bundle and SESSION_SECRET',
      [
        "SESSION_SECRET=… hozu browse / --build dist/workers --session '{…}'",
        'Without them, sign in with steps: --do "fill Email=…" --do "click Sign in"',
      ],
    )
  if (built && process.env.SESSION_SECRET) {
    const store = server.kvSessions(
      {
        get: async (k: string) => kv.get(k) ?? null,
        put: async (k: string, v: string) => void kv.set(k, v),
        delete: async (k: string) => void kv.delete(k),
      },
      { secret: process.env.SESSION_SECRET },
    )
    parts.cookies = await Promise.all(
      sessions.map((json) => (json === undefined ? null : store.issue(JSON.parse(json)))),
    )
  }
  const handler: { fetch(request: Request): Promise<Response> } = built
    ? await builtHandler(built, kv)
    : server.createHandler(parts.module.app, {
        styles,
        components,
        env: process.env,
        readFile: (file: string) => readFile(file),
        ...(parts.session ? { session: parts.session } : {}),
        onError: collectingErrors(parts.module.options, (serverError) => post({ serverError })),
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
