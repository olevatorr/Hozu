import { get, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { hydrate } from '@hozu/runtime-client'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { liveResolvers, site } from './support-live.ts'

const post = (base: string, path: string, body: unknown) =>
  new Promise<string>((resolve, reject) => {
    const req = request(
      `${base}${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => resolve(text))
      },
    )
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20))
}

describe('client fetch for new query keys (G4) and live queries (G11)', () => {
  it('fetches only keys the server did not render, and refreshes live queries on invalidation', async () => {
    const build = buildProject(site)
    const data = liveResolvers()
    const server = createServer({ build, resolvers: data.set })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const html = await (await fetch(`${base}/`)).text()
      expect(html).toContain('<li>apple</li><li>apricot</li><li>banana</li><li>cherry</li>')
      expect(html).toContain(
        '"live":{"finder.clock{}":{"query":"finder.clock","input":{},"tags":["finder.clockTag"]}}',
      )
      expect(await post(base, '/_hozu/query', { query: 'finder.nope', input: {} })).toBe('Unknown query')

      const window = new Window({ url: base })
      const document = window.document as unknown as Document
      document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
      const queried: string[] = []
      let push: (tags: string[]) => void = () => {}
      await hydrate(document, {
        loadFns: async () => ({}),
        query: async (q, input) => {
          queried.push(q + JSON.stringify(input))
          return JSON.parse(await post(base, '/_hozu/query', { query: q, input }))
        },
        live: (onTags) => {
          push = onTags
        },
      })
      expect(queried).toEqual([])
      const input = document.querySelector('input')!
      input.value = 'ap'
      input.dispatchEvent(new window.Event('input', { bubbles: true }) as never)
      expect(document.querySelector('p.pending')?.textContent).toBe('Searching…')
      await until(() => document.querySelectorAll('li').length === 2)
      expect([...document.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['apple', 'apricot'])
      expect(queried).toEqual(['finder.search{"q":"ap"}'])

      expect(document.querySelector('p.tick')!.textContent).toBe('Tick 0')
      data.bump()
      push(['finder.clockTag'])
      await until(() => document.querySelector('p.tick')!.textContent === 'Tick 1')
      expect(document.querySelector('p.tick')!.textContent).toBe('Tick 1')
    } finally {
      server.close()
    }
  })

  it('streams invalidated tags over server-sent events', async () => {
    const build = buildProject(site)
    const server = createServer({ build, resolvers: liveResolvers().set })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const received = await new Promise<string>((resolve) => {
        get(`${base}/_hozu/live`, (res) => {
          expect(res.headers['content-type']).toBe('text/event-stream')
          res.on('data', (c: Buffer) => {
            const m = /data: (.*)\n\n/.exec(c.toString())
            if (m) {
              resolve(m[1]!)
              res.destroy()
            }
          })
          setTimeout(() => server.revalidate(['finder.clockTag']), 50)
        })
      })
      expect(JSON.parse(received)).toEqual(['finder.clockTag'])
    } finally {
      server.closeAllConnections()
      server.close()
    }
  })
})
