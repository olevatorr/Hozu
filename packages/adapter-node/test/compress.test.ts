import { createServer as createHttp, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { createServer, respond, send } from '@hozu/adapter-node'
import { appOptionsOf } from '@hozu/runtime-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from './support.ts'

const cart = (await import('../../../examples/cart/app.ts')).default

interface Raw {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
  chunks: number
}

describe('compression in adapter-node (ADR 0057 B1)', () => {
  const server = createServer({ build, resolvers: appOptionsOf(cart)!.resolvers })
  let port = 0
  beforeAll(() => new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())))
  beforeAll(() => {
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  const raw = (path: string, encoding?: string, method = 'GET') =>
    new Promise<Raw>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path, method, headers: encoding ? { 'accept-encoding': encoding } : {} },
        (res) => {
          const parts: Buffer[] = []
          res.on('data', (c: Buffer) => parts.push(c))
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: Buffer.concat(parts),
              chunks: parts.length,
            }),
          )
        },
      )
      req.on('error', reject)
      req.end()
    })

  it('a page is gzipped with Vary, and decodes to the same HTML', async () => {
    const plain = await raw('/')
    const zipped = await raw('/', 'gzip, deflate, br')
    expect(plain.headers['content-encoding']).toBeUndefined()
    expect(String(plain.headers.vary)).toMatch(/Accept-Encoding/)
    expect(zipped.headers['content-encoding']).toBe('gzip')
    expect(String(zipped.headers.vary)).toMatch(/Accept-Encoding/)
    expect(zipped.headers['content-length']).toBeUndefined()
    expect(gunzipSync(zipped.body).toString()).toBe(plain.body.toString())
    expect(zipped.body.length).toBeLessThan(plain.body.length / 2)
  })

  it('the client script is brotli when accepted, gzip otherwise, and identical once decoded', async () => {
    const path = /src="([^"]*\/_hozu\/client\.js[^"]*)"/.exec((await raw('/')).body.toString())![1]!
    const plain = await raw(path)
    const br = await raw(path, 'br')
    const gz = await raw(path, 'gzip')
    expect([br.headers['content-encoding'], gz.headers['content-encoding']]).toEqual(['br', 'gzip'])
    expect(brotliDecompressSync(br.body).equals(plain.body)).toBe(true)
    expect(gunzipSync(gz.body).equals(plain.body)).toBe(true)
  })

  it('HEAD and a client that accepts nothing get no encoding', async () => {
    const head = await raw('/', 'gzip', 'HEAD')
    expect([head.headers['content-encoding'], head.body.length]).toEqual([undefined, 0])
    expect(String(head.headers.vary)).toMatch(/Accept-Encoding/)
    expect((await raw('/', 'identity')).headers['content-encoding']).toBeUndefined()
  })
})

describe('a compressed stream keeps streaming (ADR 0057 B1)', () => {
  it('the first chunk decodes before the second one exists', async () => {
    const { PassThrough } = await import('node:stream')
    const { createGunzip } = await import('node:zlib')
    const { streamCompressed } = await import('../src/compress.ts')
    let release: () => void = () => {}
    const later = new Promise<void>((r) => (release = r))
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('<head>shell</head>'))
        await later
        controller.enqueue(new TextEncoder().encode('<p>data</p>'))
        controller.close()
      },
    })
    const wire = new PassThrough()
    const seen: string[] = []
    const gunzip = createGunzip()
    gunzip.on('data', (c: Buffer) => seen.push(c.toString()))
    wire.pipe(gunzip)
    const done = streamCompressed(wire as never, body.getReader(), 'gzip')
    for (let i = 0; i < 50 && !seen.length; i++) await new Promise((r) => setTimeout(r, 10))
    expect(seen.join('')).toBe('<head>shell</head>')
    release()
    await done
    await new Promise((r) => gunzip.on('end', r))
    expect(seen.join('')).toBe('<head>shell</head><p>data</p>')
  })
})

describe('compression never mixes visitors or holds back a stream (0.16 review)', () => {
  const serve = (answer: (req: import('node:http').IncomingMessage) => Response) => {
    const s = createHttp((req, res) => void send(res, answer(req), req))
    return new Promise<{ port: number; close(): Promise<void> }>((resolve) =>
      s.listen(0, '127.0.0.1', () =>
        resolve({
          port: (s.address() as AddressInfo).port,
          close: () => new Promise<void>((r) => s.close(() => r())),
        }),
      ),
    )
  }
  const get = (port: number, path: string, headers: Record<string, string>) =>
    new Promise<{ body: Buffer; encoding: string | undefined; firstAt: number; endAt: number }>(
      (resolve, reject) => {
        const start = Date.now()
        let firstAt = 0
        const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
          const parts: Buffer[] = []
          res.on('data', (c: Buffer) => {
            firstAt ||= Date.now() - start
            parts.push(c)
          })
          res.on('end', () =>
            resolve({
              body: Buffer.concat(parts),
              encoding: res.headers['content-encoding'],
              firstAt,
              endAt: Date.now() - start,
            }),
          )
        })
        req.on('error', reject)
        req.end()
      },
    )

  it('a private answer under /_hozu/ is compressed per request, never served to another visitor', async () => {
    const s = await serve(
      (req) =>
        new Response(`hello ${req.headers.cookie} `.repeat(200), {
          headers: { 'content-type': 'text/plain', 'cache-control': 'private, max-age=60, immutable' },
        }),
    )
    try {
      const ada = await get(s.port, '/_hozu/me.txt', { cookie: 'ada', 'accept-encoding': 'br' })
      const bob = await get(s.port, '/_hozu/me.txt', { cookie: 'bob', 'accept-encoding': 'br' })
      expect(brotliDecompressSync(ada.body).toString()).toContain('hello ada')
      expect(brotliDecompressSync(bob.body).toString()).toContain('hello bob')
    } finally {
      await s.close()
    }
  })

  it('a streamed text answer arrives as it is written, not when it ends', async () => {
    const s = await serve(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            async start(c) {
              c.enqueue(new TextEncoder().encode('first '))
              await new Promise((r) => setTimeout(r, 400))
              c.enqueue(new TextEncoder().encode('second'))
              c.close()
            },
          }),
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
    )
    try {
      const got = await get(s.port, '/api/stream', { 'accept-encoding': 'gzip' })
      expect(got.encoding).toBe('gzip')
      expect(gunzipSync(got.body).toString()).toBe('first second')
      expect(got.firstAt).toBeLessThan(got.endAt - 250)
    } finally {
      await s.close()
    }
  })

  it('Cache-Control: no-transform is sent as it is', async () => {
    const s = await serve(
      () =>
        new Response('x'.repeat(4000), {
          headers: { 'content-type': 'text/plain', 'cache-control': 'no-transform' },
        }),
    )
    try {
      expect((await get(s.port, '/api/raw', { 'accept-encoding': 'gzip' })).encoding).toBeUndefined()
    } finally {
      await s.close()
    }
  })

  it('a body that fails mid-stream cuts the connection instead of rejecting (and crashing the server)', async () => {
    for (const encoding of ['gzip', 'identity']) {
      const failing = () =>
        new Response(
          new ReadableStream<Uint8Array>({
            async start(c) {
              c.enqueue(new TextEncoder().encode('first '))
              await new Promise((r) => setTimeout(r, 50))
              c.error(new Error('boom'))
            },
          }),
          { headers: { 'content-type': 'text/plain' } },
        )
      const settled: Promise<void>[] = []
      const s = createHttp((req, res) => void settled.push(respond(res, failing(), req)))
      await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
      try {
        const port = (s.address() as AddressInfo).port
        const outcome = await new Promise<string>((resolve) => {
          const req = request(
            { host: '127.0.0.1', port, path: '/x', headers: { 'accept-encoding': encoding } },
            (res) => {
              res.on('data', () => {})
              res.on('end', () => resolve('ended'))
              res.on('error', () => resolve('cut'))
              res.on('aborted', () => resolve('cut'))
            },
          )
          req.on('error', () => resolve('cut'))
          req.end()
        })
        expect(outcome).toBe('cut')
        await expect(Promise.all(settled)).resolves.toBeDefined()
      } finally {
        await new Promise<void>((r) => s.close(() => r()))
      }
    }
  })
})
