import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { send, toRequest } from '@hozu/adapter-node'
import { feature, mutation, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, type Handler, httpBus } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const itemsTag = tag({ param: null })
const listItems = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
  runs: 'server',
})
const addItem = mutation({
  input: z.object({ title: z.string() }),
  output: z.object({}),
  invalidates: () => [itemsTag()],
  runs: 'server',
  access: 'anyone',
})
const List = ui.view({
  render: () =>
    ui.main({}, [
      ui.query(
        listItems,
        {},
        {
          ready: (items) => ui.ul({}, [ui.each(items, null, (t) => ui.li({}, [t]))]),
          failed: { Unexpected: () => null },
        },
      ),
    ]),
})
const app = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [List], head: { render: () => ({ title: 'Items' }) } })],
  features: [
    feature({
      id: 'items',
      intent: { summary: 'many instances' },
      declarations: [{ itemsTag, listItems, addItem, List }],
    }),
  ],
})
const build = buildProject(app, { sources: false })
const database = ['Milk']
const secret = 'a-shared-secret-of-at-least-32-characters'

const servers: Server[] = []
const handlers: Handler[] = []
const bases: string[] = []
const errors: unknown[] = []

beforeAll(async () => {
  for (let i = 0; i < 4; i++) {
    const server = createHttpServer(async (req, res) => send(res, await handlers[i]!.fetch(toRequest(req))))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    servers.push(server)
    bases.push(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  }
  for (let i = 0; i < 4; i++)
    handlers.push(
      createHandler({
        build,
        resolvers: resolvers(app, (implement) => [
          implement(listItems, () => [...database]),
          implement(addItem, ({ title }) => {
            database.push(title)
            return {}
          }),
        ]),
        bus: httpBus({ peers: bases, secret, onError: (e) => errors.push(e) }),
        onError: (e) => errors.push(e),
      }),
    )
})
afterAll(() => {
  for (const s of servers) s.closeAllConnections()
  for (const s of servers) s.close()
})

const page = async (i: number) => {
  const r = await fetch(`${bases[i]}/`)
  return [r.headers.get('x-hozu-cache'), (await r.text()).match(/<li>[^<]*<\/li>/g)?.join('')]
}
const settle = async (until: () => Promise<boolean>) => {
  for (let i = 0; i < 100 && !(await until()); i++) await new Promise((r) => setTimeout(r, 10))
}

describe('the invalidation bus across four instances (ADR 0050 B)', () => {
  it('a mutation on one instance drops the cached pages on every instance and pushes to live clients on others', async () => {
    for (let i = 0; i < 4; i++) await page(i)
    for (let i = 0; i < 4; i++) expect(await page(i)).toEqual(['hit', '<li>Milk</li>'])

    const live = await fetch(`${bases[3]}/_hozu/live?tag=items.itemsTag`)
    const reader = live.body!.getReader()
    await reader.read()

    const effect = await fetch(`${bases[0]}/_hozu/effect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: bases[0]! },
      body: JSON.stringify({ effect: 'items.addItem', input: { title: 'Eggs' }, keys: [] }),
    })
    expect(effect.status).toBe(200)
    const pushed = new TextDecoder().decode((await reader.read()).value)
    expect(pushed).toBe('data: ["items.itemsTag"]\n\n')
    await reader.cancel()

    await settle(async () => (await page(2))[1] === '<li>Milk</li><li>Eggs</li>')
    for (let i = 0; i < 4; i++) expect((await page(i))[1]).toBe('<li>Milk</li><li>Eggs</li>')
    expect(errors).toEqual([])
  })

  it('refuses an unsigned, a wrongly signed or an expired message', async () => {
    const post = (headers: Record<string, string>, body: string) =>
      fetch(`${bases[1]}/_hozu/invalidate`, { method: 'POST', headers, body })
    const body = JSON.stringify({ tags: ['items.itemsTag'], at: Date.now(), from: 'x' })
    expect((await post({}, body)).status).toBe(403)
    expect((await post({ 'x-hozu-signature': '0'.repeat(64) }, body)).status).toBe(403)
    let failed: unknown = null
    const late = httpBus({
      peers: [bases[1]!],
      secret,
      now: () => Date.now() - 60_000,
      retries: [],
      onError: (e) => {
        failed = e
      },
    })
    await late.publish(['items.itemsTag'])
    expect(String(failed)).toContain('answered 403')
  })

  it('needs a long secret', () => {
    expect(() => httpBus({ peers: [], secret: 'short' })).toThrow('at least 32 characters')
  })
})

describe('staticTtl (ADR 0050 D2)', () => {
  it("regenerates a cached 'static' page after staticTtl seconds", async () => {
    let time = 0
    const handler = createHandler({
      build,
      now: () => time,
      staticTtl: 60,
      resolvers: resolvers(app, (implement) => [
        implement(listItems, () => [...database]),
        implement(addItem, () => ({})),
      ]),
    })
    const cache = async () =>
      (await handler.fetch(new Request('http://localhost/'))).headers.get('x-hozu-cache')
    await cache()
    time = 59_999
    expect(await cache()).toBe('hit')
    time = 60_000
    expect(await cache()).not.toBe('hit')
  })
})
