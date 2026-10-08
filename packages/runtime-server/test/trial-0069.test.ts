import { event, feature, machine, on, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const topics = ['makers', 'news'] as const
const journal = route({
  path: '/journal',
  params: null,
  search: z.object({ topic: z.enum(['all', ...topics]).default('all') }),
})
const secret = route({ path: '/secret', params: null, search: null })
const count = query({
  input: z.object({ topic: z.string() }),
  output: z.object({ n: z.number() }),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const mine = query({
  input: z.object({}),
  output: z.object({ text: z.string() }),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})
const Journal = ui.view({
  route: journal,
  render: ({ search }) =>
    ui.main({}, [
      ui.query(
        count,
        { topic: search.topic },
        {
          ready: (c) => ui.p({}, [ui.format.plural(c.n, { one: '# article', other: '# articles' })]),
          failed: { Unexpected: () => ui.p({}, ['none']) },
        },
      ),
      ui.ul({}, [...topics.map((t) => (t === 'news' ? null : ui.li({}, [t])))]),
      ui.a({ href: 'https://example.com', rel: 'noopener' }, ['out']),
      ui.nav({}, [
        ui.a({ href: ui.link(journal, null) }, ['Journal']),
        ui.a({ href: ui.link(journal, null, { topic: 'makers' }) }, ['Makers']),
        ui.a({ href: ui.link(secret, null) }, ['Secret']),
      ]),
    ]),
})
const Secret = ui.view({ render: () => ui.p({}, ['secret']) })
const app = project({
  schema: zodAdapter,
  session: z.object({ user: z.string() }),
  routes: { journal, secret },
  pages: [
    ui.page(journal, {
      views: [Journal],
      head: {
        query: count,
        input: (_, __, search) => ({ topic: search.topic }),
        render: (c, _, __, search) => ({ title: `${search.topic} · ${c.n}` }),
      },
    }),
    ui.page(secret, { views: [Secret], head: { query: mine, render: (m) => ({ title: m.text }) } }),
  ],
  features: [
    feature({
      id: 'j',
      intent: { summary: 'trial fixes' },
      declarations: [{ count, mine, Journal, Secret }],
    }),
  ],
})

const handler = () =>
  createHandler({
    build: buildProject(app, { sources: false }),
    resolvers: resolvers(app, (implement) => [
      implement(count, ({ topic }) => ({ n: topic === 'makers' ? 1 : 3 })),
      implement(mine, (_, { fail }) => fail('Forbidden', { message: 'Staff only' })),
    ]),
  })

describe('0.22 fixes from the trial apps (ADR 0069)', () => {
  it('head reads search, plural counts, null drops out of a list, <a rel> is allowed (B9, B14, B11, B12)', async () => {
    const res = await handler().fetch(new Request('http://localhost/journal?topic=makers'))
    const html = await res.text()
    expect(html).toContain('<title>makers · 1</title>')
    expect(html).toContain('1 article<')
    expect(html).toContain('<li>makers</li></ul>')
    expect(html).toContain('rel="noopener"')
    expect(html).toContain('<a href="/journal" aria-current="true">Journal</a>')
    expect(html).toContain('<a href="/journal?topic=makers" aria-current="page">Makers</a>')
    expect(html).toContain('<a href="/secret">Secret</a>')
    const all = await (await handler().fetch(new Request('http://localhost/journal'))).text()
    expect(all).toContain('<title>all · 3</title>')
    expect(all).toContain('3 articles<')
  })

  it("a resolver's fail('Forbidden') answers like access does (B8)", async () => {
    const res = await handler().fetch(new Request('http://localhost/secret'))
    expect(res.status).toBe(403)
  })
})

describe('kept state follows only a view two pages share (ADR 0069 B1)', () => {
  it('marks the features of shared views in the payload', async () => {
    const Toggle = event({ payload: z.object({}) })
    const menu = machine({
      context: z.object({ open: z.boolean() }),
      initialContext: { open: false },
      initial: 'idle',
      states: ({ ctx }) => ({
        idle: {
          on: [
            on(Toggle, {
              assign: () => {
                ctx.open = !ctx.open
              },
            }),
          ],
        },
      }),
    })
    const Header = ui.view({
      machine: menu,
      render: () =>
        ui.header({}, [ui.button({ type: 'button', on: { click: ui.send(Toggle, {}) } }, ['Menu'])]),
    })
    const one = route({ path: '/', params: null, search: null })
    const two = route({ path: '/two', params: null, search: null })
    const Body = ui.view({ render: () => ui.main({}, ['body']) })
    const site = project({
      schema: zodAdapter,
      routes: { one, two },
      pages: [
        ui.page(one, { views: [Header, Body], head: { render: () => ({ title: 'one' }) } }),
        ui.page(two, { views: [Header], head: { render: () => ({ title: 'two' }) } }),
      ],
      features: [
        feature({ id: 'h', intent: { summary: 'menu' }, declarations: [{ Toggle, menu, Header, Body }] }),
      ],
    })
    const html = await (
      await createHandler({
        build: buildProject(site, { sources: false }),
        resolvers: resolvers(site, () => []),
      }).fetch(new Request('http://localhost/'))
    ).text()
    expect(html).toContain('"keep":["h"]')
  })
})
