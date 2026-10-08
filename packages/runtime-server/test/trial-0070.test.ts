import { event, feature, machine, on, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const order = route({ path: '/orders/:id', params: z.object({ id: z.coerce.number().int() }), search: null })
const shop = route({
  path: '/shop/:category?',
  params: z.object({ category: z.string().nullable() }),
  search: z.object({
    sort: z.enum(['featured', 'new']).default('featured'),
    page: z.coerce.number().default(1),
  }),
})
const getOrder = query({
  input: z.object({ id: z.number() }),
  output: z.object({ id: z.number() }),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const Order = ui.view({ route: order, render: ({ params }) => ui.p({}, ['Order ', params.id]) })
const Shop = ui.view({
  route: shop,
  render: ({ search }) =>
    ui.nav({}, [
      ui.a({ href: ui.link(shop, { category: 'mugs' }, { sort: search.sort, page: search.page }) }, ['Mugs']),
      ui.a({ href: ui.link(shop, { category: 'mugs' }, { ...search, page: 2 }) }, ['Next']),
    ]),
})
const app = project({
  schema: zodAdapter,
  site: { url: 'https://shop.example', name: 'Shop', lang: 'en' },
  routes: { order, shop },
  pages: [
    ui.page(order, {
      views: [Order],
      head: { query: getOrder, input: (p) => ({ id: p.id }), render: (o) => ({ title: `Order ${o.id}` }) },
    }),
    ui.page(shop, { views: [Shop], head: { render: () => ({ title: 'Shop' }) } }),
  ],
  features: [feature({ id: 'o', intent: { summary: 'orders' }, declarations: [{ getOrder, Order, Shop }] })],
})
const handler = createHandler({
  build: buildProject(app, { sources: false }),
  resolvers: resolvers(app, (implement) => [implement(getOrder, ({ id }) => ({ id }))]),
})

describe('0.23 fixes from the 0.22 trials (ADR 0070)', () => {
  it('route params are parsed, so z.coerce.number() gives the query a number', async () => {
    const res = await handler.fetch(new Request('https://shop.example/orders/42'))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>Order 42</title>')
  })

  it('canonical and links leave defaults out after an optional segment', async () => {
    const html = await (await handler.fetch(new Request('https://shop.example/shop/apparel'))).text()
    expect(html).toContain('<link rel="canonical" href="https://shop.example/shop/apparel">')
    expect(html).toContain('href="/shop/mugs"')
  })

  it('a link keeps the current search with a spread and changes one field (ADR 0070 B2)', async () => {
    const html = await (await handler.fetch(new Request('https://shop.example/shop/apparel?sort=new'))).text()
    expect(html).toContain('href="/shop/mugs?page=2&amp;sort=new">Next</a>')
  })
})

describe('a native multi-step form keeps its step (ADR 0070 B1)', () => {
  const Next = event({ payload: z.object({ line1: z.string() }) })
  const Pay = event({ payload: z.object({ card: z.string() }) })
  const placed = route({ path: '/placed', params: null, search: null })
  const checkout = route({ path: '/checkout', params: null, search: null })
  const flow = machine({
    context: z.object({ line1: z.string() }),
    initialContext: { line1: '' },
    initial: 'address',
    states: ({ ctx }) => ({
      address: {
        on: [
          on(Next, {
            target: 'payment',
            assign: (e) => {
              ctx.line1 = e.line1
            },
          }),
        ],
      },
      payment: { on: [on(Pay, { target: 'address', navigate: () => ui.link(placed, null) })] },
    }),
  })
  const Checkout = ui.view({
    machine: flow,
    render: ({ is, ctx }) =>
      ui.main({}, [
        is(['address'])
          ? ui.form({ on: { submit: ui.send(Next, { line1: ui.dom.form('line1') }) } }, [
              ui.input({ name: 'line1' }),
              ui.button({ type: 'submit' }, ['Continue']),
            ])
          : ui.form({ on: { submit: ui.send(Pay, { card: ui.dom.form('card') }) } }, [
              ui.p({}, ['Ship to ', ctx.line1]),
              ui.input({ name: 'card' }),
              ui.button({ type: 'submit' }, ['Pay']),
            ]),
        ui.form({ method: 'get', on: { submit: ui.send(Pay, { card: ui.dom.form('q') }) } }, [
          ui.input({ name: 'q' }),
        ]),
      ]),
  })
  const Placed = ui.view({ render: () => ui.p({}, ['Thanks']) })
  const shop = project({
    schema: zodAdapter,
    routes: { checkout, placed },
    pages: [
      ui.page(checkout, { views: [Checkout], head: { render: () => ({ title: 'Checkout' }) } }),
      ui.page(placed, { views: [Placed], head: { render: () => ({ title: 'Placed' }) } }),
    ],
    features: [
      feature({
        id: 'c',
        intent: { summary: 'two steps' },
        declarations: [{ Next, Pay, flow, Checkout, Placed }],
      }),
    ],
  })
  const h = createHandler({
    build: buildProject(shop, { sources: false }),
    resolvers: resolvers(shop, () => []),
  })
  const actionOf = (html: string) =>
    /<form method="post" action="([^"]+)"/.exec(html)![1]!.replaceAll('&amp;', '&')
  const post = (action: string, body: Record<string, string>) =>
    h.fetch(
      new Request(`http://localhost${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
        body: new URLSearchParams(body),
      }),
    )
  const tokenOf = (html: string) =>
    /name="__hozu_state" value="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&')

  it('the second step posts the signed state back and finishes', async () => {
    const page = await (await h.fetch(new Request('http://localhost/checkout'))).text()
    const r1 = await post(actionOf(page), { line1: '18 Birch Ave' })
    const step2 = await r1.text()
    expect(r1.status).toBe(200)
    expect(step2.replaceAll('<!---->', '')).toContain('Ship to 18 Birch Ave')
    const token = tokenOf(step2)
    expect(token).toBeDefined()
    expect(step2.match(/__hozu_state/g)).toHaveLength(1)
    const done = await post(actionOf(step2), { card: '4242', __hozu_state: token! })
    expect(done.status).toBe(303)
    expect(done.headers.get('location')).toBe('/placed')
  })

  it('a changed token is ignored: the form starts over', async () => {
    const page = await (await h.fetch(new Request('http://localhost/checkout'))).text()
    const step2 = await (await post(actionOf(page), { line1: 'A' })).text()
    const forged = `${tokenOf(step2)!.slice(0, -2)}xx`
    const res = await post(actionOf(step2), { card: '4242', __hozu_state: forged })
    expect(res.headers.get('location')).not.toBe('/placed')
  })
})

describe('the sealed state is bound and kept to forms Hozu posts (0.23 review)', () => {
  it('a token signed with the secret, for another session or tampered, is refused; without a secret a plain token works', async () => {
    const { seal, unseal } = await import('../src/seal.ts')
    const snap = { state: 'payment', context: { line1: 'A' }, entry: 2 }
    const signed = (await seal('s3cret-0123456789abcdef', 'c', 'bind-a', snap))!
    expect(await unseal('s3cret-0123456789abcdef', 'c', 'bind-a', signed)).toEqual(snap)
    expect(await unseal('s3cret-0123456789abcdef', 'c', 'bind-b', signed)).toBeNull()
    expect(await unseal('s3cret-0123456789abcdef', 'd', 'bind-a', signed)).toBeNull()
    expect(await unseal('s3cret-0123456789abcdef', 'c', 'bind-a', `${signed.split('.')[0]}.`)).toBeNull()
    const plain = (await seal(undefined, 'c', 'bind-a', snap))!
    expect(await unseal(undefined, 'c', 'bind-a', plain)).toEqual(snap)
    expect(await unseal('s3cret-0123456789abcdef', 'c', 'bind-a', plain)).toBeNull()
  })
})

describe('current(route) marks a section explicitly (ADR 0071 A1)', () => {
  const list = route({
    path: '/orders',
    params: null,
    search: z.object({ status: z.string().default('all') }),
  })
  const detail = route({ path: '/orders/:id', params: z.object({ id: z.coerce.number() }), search: null })
  const settings = route({ path: '/settings', params: null, search: null })
  const Sidebar = ui.view({
    render: ({ current }) =>
      ui.nav({}, [
        ui.a({ href: ui.link(list, null), 'aria-current': current(list) || current(detail) }, ['Orders']),
        ui.a({ href: ui.link(settings, null), 'aria-current': current(settings) }, ['Settings']),
      ]),
  })
  const Body = ui.view({ render: () => ui.main({}, ['body']) })
  const head = { render: () => ({ title: 'x' }) }
  const back = project({
    schema: zodAdapter,
    routes: { list, detail, settings },
    pages: [
      ui.page(list, { views: [Sidebar, Body], head }),
      ui.page(detail, { views: [Sidebar, Body], head }),
      ui.page(settings, { views: [Sidebar, Body], head }),
    ],
    features: [feature({ id: 'n', intent: { summary: 'menu' }, declarations: [{ Sidebar, Body }] })],
  })
  const h = createHandler({
    build: buildProject(back, { sources: false }),
    resolvers: resolvers(back, () => []),
  })
  const nav = async (path: string) => {
    const html = await (await h.fetch(new Request(`http://localhost${path}`))).text()
    return /<nav[^>]*>(.*?)<\/nav>/.exec(html)?.[1]
  }

  it('on a filtered list and on a detail page, and nothing on the other link', async () => {
    expect(await nav('/orders')).toBe(
      '<a href="/orders" aria-current="page">Orders</a><a href="/settings">Settings</a>',
    )
    for (const path of ['/orders?status=open', '/orders/7'])
      expect(await nav(path)).toBe(
        '<a href="/orders" aria-current="true">Orders</a><a href="/settings">Settings</a>',
      )
    expect(await nav('/settings')).toBe(
      '<a href="/orders">Orders</a><a href="/settings" aria-current="page">Settings</a>',
    )
  })
})
