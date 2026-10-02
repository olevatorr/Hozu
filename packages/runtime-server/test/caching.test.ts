import { endpoint, feature, mutation, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, memorySessions } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const origin = 'http://app.test'
const Session = z.object({ user: z.string() })
const itemsTag = tag({ param: null })
const items = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
  runs: 'server',
})
const mine = query({
  input: z.object({ limit: z.number() }),
  output: z.object({ user: z.string(), limit: z.number() }),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
})
const add = mutation({ input: z.object({ text: z.string().trim() }), output: z.string(), runs: 'server' })
const echo = endpoint({
  method: 'GET',
  path: '/api/echo',
  input: z.object({ n: z.coerce.number().default(7) }),
  output: z.object({ n: z.number() }),
})
const home = route({ path: '/', params: null, search: null })
const account = route({ path: '/account', params: null, search: null })
const List = ui.view({
  render: () =>
    ui.main({}, [
      ui.query(
        items,
        {},
        {
          ready: (list) => ui.ul({}, [ui.each(list, null, (t) => ui.li({}, [t]))]),
          failed: { Unexpected: () => ui.p({}, ['error']) },
        },
      ),
    ]),
})
const Mine = ui.view({
  render: () =>
    ui.main({}, [
      ui.query(
        mine,
        { limit: 2 },
        {
          ready: (m) => ui.p({}, [m.user, ' ', m.limit]),
          failed: { Unexpected: () => ui.p({}, ['error']) },
        },
      ),
    ]),
})
const app = project({
  schema: zodAdapter,
  session: Session,
  site: { url: origin, name: 'Cache', lang: 'en' },
  routes: { home, account },
  pages: [
    ui.page(home, { views: [List], head: { render: () => ({ title: 'Items' }) } }),
    ui.page(account, { views: [Mine], head: { render: () => ({ title: 'Account' }) } }),
  ],
  features: [
    feature({
      id: 'shop',
      intent: { summary: 'ADR 0043 A caching' },
      declarations: [{ itemsTag, items, mine, add, echo, List, Mine }],
    }),
  ],
})

function setup() {
  const list = ['Mug']
  const gates: (() => void)[] = []
  let gated = false
  const seen: unknown[] = []
  const store = memorySessions({ secret: 'x'.repeat(40), secure: false })
  const handler = createHandler({
    build: buildProject(app, { sources: false }),
    session: store,
    csp: false,
    resolvers: resolvers(app, (implement) => [
      implement(items, async () => {
        const snapshot = [...list]
        if (gated) await new Promise<void>((r) => gates.push(r))
        return snapshot
      }),
      implement(mine, ({ limit }, { session }) => ({ user: session?.user ?? 'nobody', limit })),
      implement(add, ({ text }) => {
        seen.push(text)
        return text
      }),
      implement(echo, ({ n }) => {
        seen.push(n)
        return { n }
      }),
    ]),
  })
  return {
    handler,
    list,
    seen,
    cookie: () => store.issue({ user: 'ada' }),
    gate: (on: boolean) => {
      gated = on
    },
    release: () => {
      for (const g of gates.splice(0)) g()
    },
  }
}

describe('ADR 0043 A: generations, derived HTTP caching, parsed input', () => {
  it('an ISR page rendered while its tag is revalidated is not stored', async () => {
    const { handler, list, gate, release } = setup()
    gate(true)
    const first = handler.fetch(new Request(`${origin}/`)).then((r) => r.text())
    await new Promise((r) => setTimeout(r, 5))
    list.unshift('Cup')
    expect(await handler.revalidate([itemsTag()])).toEqual({ entries: 1, pages: 0 })
    release()
    expect(await first).not.toContain('Cup')
    gate(false)
    const next = await handler.fetch(new Request(`${origin}/`))
    expect([next.headers.get('x-hozu-cache'), (await next.text()).includes('Cup')]).toEqual(['miss', true])
  })

  it('derives Cache-Control and Vary from what a response read', async () => {
    const { handler, cookie } = setup()
    const sid = (await cookie()).split(';')[0]!
    const page = await handler.fetch(new Request(`${origin}/`))
    expect([page.headers.get('cache-control'), page.headers.get('vary')]).toEqual([
      'public, max-age=0, must-revalidate',
      null,
    ])
    const own = await handler.fetch(new Request(`${origin}/account`, { headers: { cookie: sid } }))
    expect([own.headers.get('cache-control'), own.headers.get('vary')]).toEqual([
      'private, no-cache',
      'Cookie',
    ])
    expect(await own.text()).toContain('ada 2')
    const effect = await handler.fetch(
      new Request(`${origin}/_hozu/effect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', cookie: sid },
        body: JSON.stringify({ effect: 'shop.add', input: { text: ' hi ' }, keys: [] }),
      }),
    )
    expect([effect.headers.get('cache-control'), effect.headers.get('vary')]).toEqual([
      'private, no-cache',
      'Cookie',
    ])
    const publicQuery = await handler.fetch(
      new Request(`${origin}/_hozu/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'shop.items', input: {} }),
      }),
    )
    expect(publicQuery.headers.get('cache-control')).toBeNull()
    const userQuery = await handler.fetch(
      new Request(`${origin}/_hozu/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: sid },
        body: JSON.stringify({ query: 'shop.mine', input: { limit: 1 } }),
      }),
    )
    expect(userQuery.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('resolvers receive the schema-parsed input', async () => {
    const { handler, seen } = setup()
    const res = await handler.fetch(new Request(`${origin}/api/echo?n=4`))
    expect(await res.json()).toEqual({ n: 4 })
    expect(await (await handler.fetch(new Request(`${origin}/api/echo`))).json()).toEqual({ n: 7 })
    await handler.fetch(
      new Request(`${origin}/_hozu/effect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ effect: 'shop.add', input: { text: '  padded ' }, keys: [] }),
      }),
    )
    expect(seen).toEqual([4, 7, 'padded'])
  })
})
