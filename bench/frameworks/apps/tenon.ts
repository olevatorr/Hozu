import { event, feature, machine, on, op, project, query, route, ui } from '@tenon/core'
import { resolvers } from '@tenon/data'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { products } from './data.ts'

const Product = z.object({ sku: z.string(), name: z.string(), price: z.number() })
const listProducts = query({
  input: z.object({}),
  output: z.array(Product),
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})
const Add = event({ payload: z.object({ sku: z.string() }) })
const cart = machine({
  context: z.object({ count: z.number() }),
  initialContext: { count: 0 },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: { on: [on(Add, { target: 'ready', assign: () => [op.inc(ctx.count, 1)] })] },
  }),
})
const Page = ui.view({
  machine: cart,
  route: null,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.h1({}, ['Products']),
      ui.query(
        listProducts,
        {},
        {
          ready: (list) =>
            ui.ul({}, [
              ui.each(list, 'sku', (p) =>
                ui.li({}, [
                  ui.strong({}, [p.name]),
                  ' — $',
                  p.price,
                  ui.button({ type: 'button', on: { click: ui.send(Add, { sku: p.sku }) } }, ['Add']),
                ]),
              ),
            ]),
          pending: null,
          failed: { Unexpected: () => ui.p({}, ['error']) },
        },
      ),
      ui.p({}, ['Cart: ', ctx.count, ' items']),
    ]),
})
const home = route({ path: '/', params: null })
const shop = feature({
  id: 'shop',
  styles: [],
  intent: { summary: 'Benchmark page', invariants: [] },
  imports: [],
  tags: {},
  events: { Add },
  queries: { listProducts },
  mutations: {},
  fns: {},
  machine: cart,
  views: { Page },
  contracts: {},
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
const headFields = {
  title: 'Products',
  description: 'Benchmark page',
  type: 'website',
  image: null,
  published: null,
  noindex: false,
} as const
export const benchProject = project({
  schema: zodAdapter,
  styles: null,
  session: null,
  site: null,
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Page],
      assert: null,
      head: { query: null, input: null, render: () => headFields },
      entries: null,
    }),
  ],
  features: [shop],
})
export const benchResolvers = resolvers(benchProject, (implement) => [
  implement(listProducts, () => products),
])
