import { feature, project, query, route, ui } from '@hozu/core'
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
