import { type ChildProcess, spawn } from 'node:child_process'
import {
  type Dirent,
  existsSync,
  type FSWatcher,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unwatchFile,
  watch,
  watchFile,
} from 'node:fs'
import { createServer, type IncomingMessage, request, type Server, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { type AddressInfo, createServer as createNetServer } from 'node:net'
import { dirname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deleteRequest,
  devtoolsDir,
  devtoolsEntry,
  finishRequest,
  listNotes,
  listRequests,
  messagesOf,
  notesFile,
  parseTheme,
  readRequest,
  removeNote,
  replyMarkdown,
  saveRequest,
} from '@hozu/devtools'
import { devClient } from './client.ts'

let bundle: string | null = null
const devBundle = () =>
  (bundle ??= readFileSync(
    fileURLToPath(import.meta.resolve('@hozu/runtime-client/browser-dev/client.js')),
    'utf8',
  ))

export interface DevOptions {
  entry?: string
  cwd?: string
  port?: number
  appPort?: number
  debounce?: number
  devtools?: boolean
  devtoolsMode?: 'builder' | 'developer'
  /** A translation of the DevTools strings (ADR 0060 D), read again on every page load. */
  devtoolsMessages?: string | null
  requestsRoot?: string
  log?: (line: string) => void
}

export interface DevServer {
  server: Server
  url: string
  close(): Promise<void>
}

const ignored = /(^|[/\\])(node_modules|dist|dist-static|\.git|\.hozu)([/\\]|$)/
const envFile = /(^|[/\\])\.env(\.[\w.-]+)?$/
const real = (file: string) => {
  try {
    return realpathSync(file)
  } catch {
    return file
  }
}
const graphHook = new URL(import.meta.url.endsWith('.ts') ? './graph.ts' : './graph.js', import.meta.url).href

const free = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = createNetServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })

/** Thrown before anything starts when a port `hozu dev` needs is taken. */
export class PortInUse extends Error {
  readonly port: number
  constructor(port: number, ports: number[]) {
    super(`Port ${port} is in use; hozu dev needs ${ports.join(' and ')} (the dev server and the app)`)
    this.port = port
  }
}

export async function dev({
  entry,
  cwd = process.cwd(),
  port = 3000,
  appPort = port + 1,
  debounce = 60,
  devtools = true,
  devtoolsMode = 'builder',
  devtoolsMessages = null,
  requestsRoot,
  log = (line) => console.log(line),
}: DevOptions): Promise<DevServer> {
  for (const p of [port, appPort]) if (p && !(await free(p))) throw new PortInUse(p, [port, appPort])
  const clients = new Set<ServerResponse>()
  let child: ChildProcess | null = null
  let ready: Promise<void> = Promise.resolve()

  let loaded = new Set<string>()
  const start = () => {
    const transform = existsSync(join(cwd, 'node_modules/@hozu/transform'))
      ? ['--import', '@hozu/transform/register']
      : []
    const args = entry
      ? [...transform, entry]
      : [
          join(dirname(createRequire(join(cwd, 'package.json')).resolve('@hozu/cli')), '../bin/hozu.js'),
          'serve',
        ]
    loaded = new Set()
    child = spawn(process.execPath, ['--import', graphHook, ...args], {
      cwd,
      env: { ...process.env, PORT: String(appPort), HOZU_DEV: '1', HOZU_DEV_PARENT: String(process.pid) },
      stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
    })
    child.on('message', (message: { hozuGraph?: string[] }) => {
      for (const file of message?.hozuGraph ?? []) loaded.add(real(file))
    })
    ready = new Promise((resolve) => {
      child!.stdout!.on('data', (chunk: Buffer) => {
        const shown = chunk
          .toString()
          .split('\n')
          .filter(
            (line) => !line.trimEnd().endsWith(`:${appPort}`) || !/ on http:\/\/\S+$/.test(line.trimEnd()),
          )
          .join('\n')
        if (shown.trim()) process.stdout.write(shown)
        resolve()
      })
      child!.on('exit', () => resolve())
    })
  }
  const stop = () =>
    new Promise<void>((resolve) => {
      const c = child
      child = null
      if (!c || c.exitCode !== null) return resolve()
      c.once('exit', () => resolve())
      c.kill()
    })

  const send = (event: string, data: object = {}) => {
    for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  let pending: Set<string> = new Set()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = async () => {
    const files = [...pending]
    pending = new Set()
    const cssOnly = files.every((f) => f.endsWith('.css'))
    await stop()
    start()
    await ready
    log(`${cssOnly ? 'css' : 'reload'}: ${files.join(', ')}`)
    send(cssOnly ? 'css' : 'reload', { files })
  }
  const seen = new Map<string, number>()
  const record = (dir: string, rel: string) => {
    let entries: Dirent[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (ignored.test(path)) continue
      if (entry.isDirectory()) record(join(dir, entry.name), path)
      else if (entry.isFile())
        try {
          seen.set(normalize(path), statSync(join(dir, entry.name)).mtimeMs)
        } catch {}
    }
  }
  record(cwd, '')
  const untouched = (file: string) => {
    try {
      const mtime = statSync(join(cwd, file)).mtimeMs
      if (seen.get(normalize(file)) === mtime) return true
      seen.set(normalize(file), mtime)
      return false
    } catch {
      return false
    }
  }
  const realRoot = realpathSync(cwd)
  const running = () => !!child && child.exitCode === null && child.signalCode === null
  const reloads = (file: string) => {
    if (file.endsWith('.css') || envFile.test(file) || file === 'package.json' || file === 'tsconfig.json')
      return true
    if (loaded.has(join(realRoot, file))) return true
    if (!/\.(ts|mts|json)$/.test(file)) return false
    return !running() || loaded.size === 0
  }
  const watcher: FSWatcher = watch(cwd, { recursive: true }, (_, file) => {
    if (!file || ignored.test(file) || !reloads(file) || untouched(file)) return
    pending.add(file)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), debounce)
  })

  const notesPath = join(requestsRoot ?? cwd, notesFile)
  const notesMoved = () => send('notes')
  if (devtools) watchFile(notesPath, { interval: 250 }, notesMoved)

  start()
  await ready

  const local = (host: string | undefined) => !!host && /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
  const allowed = (req: IncomingMessage) => {
    if (!local(req.headers.host)) return false
    const origin = req.headers.origin
    return req.method === 'GET' || origin === `http://${req.headers.host}`
  }
  const tag = `<script type="module" src="/_hozu/dev.js"></script>${devtools ? `<script type="module" src="${devtoolsEntry}" data-mode="${devtoolsMode}"></script>` : ''}`

  const server = createServer((req, res) => {
    const path = req.url?.split('?')[0] ?? '/'
    if (devtools && (path.startsWith('/_hozu/devtools/') || path.startsWith('/_hozu/dev/'))) {
      if (!allowed(req))
        return void res
          .writeHead(403, { 'content-type': 'text/plain' })
          .end('Hozu DevTools answers only this machine')
      if (path === '/_hozu/devtools/messages.json') return void messages(res, devtoolsMessages)
      if (path.startsWith('/_hozu/devtools/')) return void serveDevtools(path, res)
      if (path === '/_hozu/dev/theme') return void theme(res, cwd, appPort)
      if (path === '/_hozu/dev/notes' || path.startsWith('/_hozu/dev/notes/'))
        return void notes(req, res, requestsRoot ?? cwd, path.slice('/_hozu/dev/notes/'.length).split('/'))
      if (path === '/_hozu/dev/requests' || path.startsWith('/_hozu/dev/requests/'))
        return void requests(
          req,
          res,
          requestsRoot ?? cwd,
          path.slice('/_hozu/dev/requests/'.length).split('/'),
        )
    }
    if (req.url === '/_hozu/dev') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (req.url === '/_hozu/dev.js')
      return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(devClient)
    if (req.url?.split('?')[0]?.endsWith('/_hozu/client.js'))
      return void res
        .writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
        .end(devBundle())
    void ready.then(() => {
      const upstream = request(
        {
          host: '127.0.0.1',
          port: appPort,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, 'accept-encoding': 'identity' },
        },
        (up) => {
          const html = String(up.headers['content-type'] ?? '').startsWith('text/html')
          if (!html) {
            res.writeHead(up.statusCode ?? 502, up.headers)
            up.pipe(res)
            return
          }
          const { 'content-length': _, ...headers } = up.headers
          res.writeHead(up.statusCode ?? 502, headers)
          up.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            res.write(text.includes('</body>') ? text.replace('</body>', `${tag}</body>`) : text)
          })
          up.on('end', () => res.end())
        },
      )
      upstream.on('error', () => res.writeHead(502, { 'content-type': 'text/plain' }).end('App not running'))
      req.pipe(upstream)
    })
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()))
  const actual = (server.address() as AddressInfo).port
  return {
    server,
    url: `http://127.0.0.1:${actual}`,
    close: async () => {
      watcher.close()
      unwatchFile(notesPath, notesMoved)
      if (timer) clearTimeout(timer)
      for (const res of clients) res.end()
      await stop()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function messages(res: ServerResponse, file: string | null) {
  let body: Record<string, string> = {}
  try {
    if (file) body = messagesOf(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    body = {}
  }
  res
    .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    .end(JSON.stringify(body))
}

function serveDevtools(path: string, res: ServerResponse) {
  const file = normalize(join(devtoolsDir, path.slice('/_hozu/devtools/'.length)))
  if (
    !file.startsWith(devtoolsDir.endsWith(sep) ? devtoolsDir : devtoolsDir + sep) ||
    !file.endsWith('.js') ||
    !existsSync(file)
  )
    return void res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
  res
    .writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    .end(readFileSync(file))
}

function requests(req: IncomingMessage, res: ServerResponse, cwd: string, [number, action]: string[]) {
  const json = (status: number, body: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(body))
  const body = () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      let text = ''
      req.on('data', (chunk: Buffer) => {
        text += chunk
        if (text.length > 1_000_000) req.destroy()
      })
      req.on('end', () => {
        try {
          resolve(text ? JSON.parse(text) : {})
        } catch (e) {
          reject(e)
        }
      })
    })
  const run = async () => {
    if (!number) {
      if (req.method === 'GET') return json(200, listRequests(cwd))
      if (req.method !== 'POST') return json(405, { error: 'GET or POST' })
      const { markdown } = await body()
      if (typeof markdown !== 'string' || !markdown.startsWith('# Hozu request: '))
        return json(400, { error: 'Expected { markdown } starting with "# Hozu request: "' })
      return json(200, saveRequest(cwd, markdown))
    }
    if (!/^\d{1,4}$/.test(number)) return json(404, { error: `No request ${number}` })
    if (req.method === 'GET' && !action) return json(200, readRequest(cwd, number))
    if (req.method === 'DELETE' && !action) {
      deleteRequest(cwd, number)
      return json(200, { deleted: number.padStart(4, '0') })
    }
    if (req.method === 'POST' && action === 'done') {
      const { result } = await body()
      if (typeof result !== 'string' || !result.trim()) return json(400, { error: 'Expected { result }' })
      return json(200, finishRequest(cwd, number, result.trim()))
    }
    return json(405, { error: 'GET, DELETE or POST …/done' })
  }
  run().catch((e: Error) => json(/^No request/.test(e.message) ? 404 : 400, { error: e.message }))
}

function notes(req: IncomingMessage, res: ServerResponse, root: string, [number, action]: string[]) {
  const json = (status: number, body: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(body))
  if (!number) return req.method === 'GET' ? json(200, listNotes(root)) : json(405, { error: 'GET' })
  const note = listNotes(root).find((n) => String(n.n) === number)
  if (!note) return json(404, { error: `No note ${number}` })
  if (req.method === 'DELETE' && !action) return json(200, removeNote(root, note.n))
  if (req.method !== 'POST' || action !== 'reply') return json(405, { error: 'DELETE or POST …/reply' })
  let text = ''
  req.on('data', (chunk: Buffer) => {
    text += chunk
    if (text.length > 100_000) req.destroy()
  })
  req.on('end', () => {
    try {
      const { reply } = JSON.parse(text || '{}') as { reply?: unknown }
      if (typeof reply !== 'string' || !reply.trim()) return json(400, { error: 'Expected { reply }' })
      json(200, saveRequest(root, replyMarkdown(note, reply.trim())))
    } catch (e) {
      json(400, { error: (e as Error).message })
    }
  })
}

function tailwindTheme(cwd: string): string {
  const from = createRequire(join(cwd, 'package.json'))
  for (const resolve of [
    () => from.resolve('tailwindcss/theme.css'),
    () => createRequire(from.resolve('@hozu/css')).resolve('tailwindcss/theme.css'),
  ])
    try {
      return readFileSync(resolve(), 'utf8')
    } catch {}
  return ''
}

function theme(res: ServerResponse, cwd: string, appPort: number) {
  const answer = (project: string) =>
    res
      .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(parseTheme(tailwindTheme(cwd), project)))
  const upstream = request(
    {
      host: '127.0.0.1',
      port: appPort,
      path: '/_hozu/dev/styles',
      headers: { host: `127.0.0.1:${appPort}` },
    },
    (up) => {
      let css = ''
      up.on('data', (chunk: Buffer) => (css += chunk))
      up.on('end', () => answer(String(up.headers['content-type']).startsWith('text/css') ? css : ''))
    },
  )
  upstream.on('error', () => answer(''))
  upstream.end()
}
