import { type ChildProcess, spawn } from 'node:child_process'
import { type FSWatcher, statSync, watch } from 'node:fs'
import { createServer, request, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { devClient } from './client.ts'

export interface DevOptions {
  entry: string
  cwd?: string
  port?: number
  appPort?: number
  debounce?: number
  log?: (line: string) => void
}

export interface DevServer {
  server: Server
  url: string
  close(): Promise<void>
}

const ignored = /(^|[/\\])(node_modules|dist|dist-static|\.git)([/\\]|$)/

export async function dev({
  entry,
  cwd = process.cwd(),
  port = 3000,
  appPort = port + 1,
  debounce = 60,
  log = (line) => console.log(line),
}: DevOptions): Promise<DevServer> {
  const clients = new Set<ServerResponse>()
  let child: ChildProcess | null = null
  let ready: Promise<void> = Promise.resolve()

  const start = () => {
    child = spawn(process.execPath, [entry], {
      cwd,
      env: { ...process.env, PORT: String(appPort), TENON_DEV: '1' },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    ready = new Promise((resolve) => {
      child!.stdout!.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk)
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

  const send = (event: string) => {
    for (const res of clients) res.write(`event: ${event}\ndata: {}\n\n`)
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
    send(cssOnly ? 'css' : 'reload')
  }
  const since = performance.timeOrigin + performance.now()
  const untouched = (file: string) => {
    try {
      return statSync(join(cwd, file)).mtimeMs < since
    } catch {
      return false
    }
  }
  const watcher: FSWatcher = watch(cwd, { recursive: true }, (_, file) => {
    if (!file || ignored.test(file) || !/\.(ts|css|json)$/.test(file) || untouched(file)) return
    pending.add(file)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), debounce)
  })

  start()
  await ready

  const server = createServer((req, res) => {
    if (req.url === '/_tenon/dev') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (req.url === '/_tenon/dev.js')
      return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(devClient)
    void ready.then(() => {
      const upstream = request(
        { host: '127.0.0.1', port: appPort, path: req.url, method: req.method, headers: req.headers },
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
            res.write(
              text.includes('</body>')
                ? text.replace('</body>', '<script type="module" src="/_tenon/dev.js"></script></body>')
                : text,
            )
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
      if (timer) clearTimeout(timer)
      for (const res of clients) res.end()
      await stop()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
