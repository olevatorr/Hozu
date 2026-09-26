import { mkdtempSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dev } from '@tenonkit/dev'
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
    const dir = mkdtempSync(join(tmpdir(), 'tenon-dev-'))
    writeFileSync(join(dir, 'style.css'), 'p { color: red }')
    writeFileSync(join(dir, 'app.ts'), app)
    const server = await dev({ entry: 'app.ts', cwd: dir, port: 0, appPort: await freePort(), log: () => {} })
    try {
      expect(await fetchText(`${server.url}/_tenon/client.js`)).toContain('tenon:snapshots')
      const html = await fetchText(`${server.url}/`)
      expect(html).toContain('<link rel="stylesheet" href="/s16.css">')
      expect(html).toContain('<script type="module" src="/_tenon/dev.js"></script></body>')
      const events: string[] = []
      const stream = await new Promise<import('node:http').IncomingMessage>((resolve) =>
        get(`${server.url}/_tenon/dev`, resolve),
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
})
