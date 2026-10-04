import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { get, request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dev } from '@hozu/dev'
import { describe, expect, it } from 'vitest'

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

const app = `import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
createServer((req, res) => {
  if (req.url.startsWith('/s')) return res.writeHead(200, { 'content-type': 'text/css' }).end(css)
  res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><link rel="stylesheet" href="/s' + css.length + '.css"></head><body><p>hi</p></body></html>')
}).listen(Number(process.env.PORT), () => console.log('ready'))
`

const fetchText = (url: string) =>
  new Promise<string>((resolve, reject) =>
    get(url, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(body))
    }).on('error', reject),
  )

describe('dev server', () => {
  it('injects the dev client, hot-swaps CSS and reloads on code changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-dev-'))
    writeFileSync(join(dir, 'style.css'), 'p { color: red }')
    writeFileSync(join(dir, 'app.ts'), app)
    const server = await dev({ entry: 'app.ts', cwd: dir, port: 0, appPort: await freePort(), log: () => {} })
    try {
      expect(await fetchText(`${server.url}/_hozu/client.js`)).toContain('hozu:snapshots')
      const html = await fetchText(`${server.url}/`)
      expect(html).toContain('<link rel="stylesheet" href="/s16.css">')
      expect(html).toMatch(
        /<script type="module" src="\/_hozu\/dev.js"><\/script>(<script[^>]*><\/script>)*<\/body>/,
      )
      const events: string[] = []
      const stream = await new Promise<import('node:http').IncomingMessage>((resolve) =>
        get(`${server.url}/_hozu/dev`, resolve),
      )
      stream.on('data', (c: Buffer) => {
        for (const m of c.toString().matchAll(/event: (\w+)/g)) events.push(m[1]!)
      })
      const until = async (n: number) => {
        for (let i = 0; i < 100 && events.length < n; i++) await new Promise((r) => setTimeout(r, 50))
      }
      writeFileSync(join(dir, 'style.css'), 'p { color: blue; font-weight: 700 }')
      await until(1)
      expect(events).toEqual(['css'])
      expect(await fetchText(`${server.url}/`)).toContain('href="/s35.css"')
      writeFileSync(join(dir, 'app.ts'), `${app}\n// edited\n`)
      await until(2)
      expect(events).toEqual(['css', 'reload'])
      stream.destroy()
    } finally {
      await server.close()
    }
  }, 20_000)

  it('shows DevTools: injects the overlay, serves its modules and saves requests from this origin only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-dev-'))
    writeFileSync(join(dir, 'style.css'), 'p { color: red }')
    writeFileSync(join(dir, 'app.ts'), app)
    const server = await dev({ entry: 'app.ts', cwd: dir, port: 0, appPort: await freePort(), log: () => {} })
    try {
      const html = await fetchText(`${server.url}/`)
      expect(html).toContain(
        '<script type="module" src="/_hozu/devtools/overlay/index.js" data-mode="builder"></script>',
      )
      expect(await fetchText(`${server.url}/_hozu/devtools/overlay/index.js`)).toContain('./app.js')
      expect(await fetchText(`${server.url}/_hozu/devtools/overlay/app.js`)).toContain('hozu-devtools')
      expect(await fetchText(`${server.url}/_hozu/devtools/prompt.js`)).toContain('requestMarkdown')
      expect((await send(server.url, 'GET', '/_hozu/devtools/../../package.json')).status).toBe(404)
      const markdown = '# Hozu request: Bigger button\n\nbody\n'
      const saved = await send(
        server.url,
        'POST',
        '/_hozu/dev/requests',
        { markdown },
        { origin: server.url },
      )
      expect(saved).toEqual({
        status: 200,
        body: { number: '0001', file: '.hozu/requests/0001-bigger-button.md' },
      })
      expect(readFileSync(join(dir, '.hozu/requests/0001-bigger-button.md'), 'utf8')).toContain(
        'Bigger button',
      )
      const listed = await send(server.url, 'GET', '/_hozu/dev/requests')
      expect(listed.body).toMatchObject([{ number: '0001', status: 'open', title: 'Bigger button' }])
      expect(
        (
          await send(
            server.url,
            'POST',
            '/_hozu/dev/requests',
            { markdown },
            { origin: 'https://evil.example' },
          )
        ).status,
      ).toBe(403)
      expect(
        (await send(server.url, 'GET', '/_hozu/dev/requests', undefined, { host: 'evil.example' })).status,
      ).toBe(403)
      expect(existsSync(join(dir, '.hozu/requests/0002-bigger-button.md'))).toBe(false)
      const one = await send(server.url, 'GET', '/_hozu/dev/requests/0001')
      expect(one.body).toMatchObject({ number: '0001', markdown: expect.stringContaining('Bigger button') })
      const done = await send(
        server.url,
        'POST',
        '/_hozu/dev/requests/1/done',
        { result: 'text-xl' },
        { origin: server.url },
      )
      expect(done.body).toMatchObject({ number: '0001', status: 'done', result: 'text-xl' })
      expect((await send(server.url, 'GET', '/_hozu/dev/requests')).body).toEqual([])
      expect((await send(server.url, 'GET', '/_hozu/dev/requests/0001')).status).toBe(404)
      const again = await send(
        server.url,
        'POST',
        '/_hozu/dev/requests',
        { markdown },
        { origin: server.url },
      )
      expect(again.body).toMatchObject({ number: '0002' })
      expect((await send(server.url, 'DELETE', '/_hozu/dev/requests/0002')).status).toBe(403)
      expect(
        (await send(server.url, 'DELETE', '/_hozu/dev/requests/0002', undefined, { origin: server.url }))
          .status,
      ).toBe(200)
      expect((await send(server.url, 'GET', '/_hozu/dev/requests')).body).toEqual([])
    } finally {
      await server.close()
    }
  }, 20_000)

  it('Done on an agent note removes it from .hozu/notes.json, from this origin only; a reply is a request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-dev-'))
    writeFileSync(join(dir, 'style.css'), 'p { color: red }')
    writeFileSync(join(dir, 'app.ts'), app)
    const { addNote, listNotes } = await import('@hozu/devtools')
    const note = { id: 'site.Home/0', label: '<p>', at: null, path: '/', within: null }
    addNote(dir, { ...note, text: 'Bigger' })
    addNote(dir, { ...note, text: 'Red' })
    const server = await dev({ entry: 'app.ts', cwd: dir, port: 0, appPort: await freePort(), log: () => {} })
    try {
      expect((await send(server.url, 'DELETE', '/_hozu/dev/notes/1')).status).toBe(403)
      expect(listNotes(dir).map((n) => n.n)).toEqual([1, 2])
      const reply = await send(
        server.url,
        'POST',
        '/_hozu/dev/notes/2/reply',
        { reply: 'Darker' },
        { origin: server.url },
      )
      expect(reply.status).toBe(200)
      expect(existsSync(join(dir, '.hozu/requests'))).toBe(true)
      expect(
        (await send(server.url, 'DELETE', '/_hozu/dev/notes/1', undefined, { origin: server.url })).status,
      ).toBe(200)
      expect(listNotes(dir).map((n) => n.n)).toEqual([2])
      expect(JSON.parse(readFileSync(join(dir, '.hozu/notes.json'), 'utf8')).notes).toHaveLength(1)
      expect(
        (await send(server.url, 'DELETE', '/_hozu/dev/notes/1', undefined, { origin: server.url })).status,
      ).toBe(404)
    } finally {
      await server.close()
    }
  }, 20_000)

  it('starts DevTools in the mode it was given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-dev-'))
    writeFileSync(join(dir, 'style.css'), 'p { color: red }')
    writeFileSync(join(dir, 'app.ts'), app)
    const server = await dev({
      entry: 'app.ts',
      cwd: dir,
      port: 0,
      appPort: await freePort(),
      log: () => {},
      devtoolsMode: 'developer',
    })
    try {
      expect(await fetchText(`${server.url}/`)).toContain('data-mode="developer"')
    } finally {
      await server.close()
    }
  }, 20_000)

  it('leaves DevTools out when it is turned off', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-dev-'))
    writeFileSync(join(dir, 'style.css'), 'p { color: red }')
    writeFileSync(join(dir, 'app.ts'), app)
    const server = await dev({
      entry: 'app.ts',
      cwd: dir,
      port: 0,
      appPort: await freePort(),
      log: () => {},
      devtools: false,
    })
    try {
      const html = await fetchText(`${server.url}/`)
      expect(html).toContain('/_hozu/dev.js')
      expect(html).not.toContain('devtools')
      expect((await send(server.url, 'GET', '/_hozu/dev/requests')).body).toContain('<p>hi</p>')
    } finally {
      await server.close()
    }
  }, 20_000)
})

function send(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const url = new URL(path, base)
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        port: url.port,
        path,
        method,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => {
          let parsed: unknown = text
          try {
            parsed = JSON.parse(text)
          } catch {}
          resolve({ status: res.statusCode ?? 0, body: parsed })
        })
      },
    )
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

describe('dev server and a compressing app (ADR 0057 B1)', () => {
  it('a browser that accepts gzip gets the whole page with the dev client', async () => {
    const notes = new URL('../../../examples/notes/', import.meta.url).pathname
    const server = await dev({ cwd: notes, port: 0, appPort: await freePort(), log: () => {} })
    try {
      const page = await new Promise<{ encoding: string | undefined; body: string }>((resolve, reject) =>
        get(`${server.url}/login`, { headers: { 'accept-encoding': 'gzip, deflate, br' } }, (res) => {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body }))
        }).on('error', reject),
      )
      expect(page.encoding).toBeUndefined()
      expect(page.body).toContain('<script type="module" src="/_hozu/dev.js"></script>')
      expect(page.body).toContain('</html>')
    } finally {
      await server.close()
    }
  }, 60_000)
})
