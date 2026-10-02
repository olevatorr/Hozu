import { contract, event, feature, machine, on, project, query, route, ui } from '@hozu/core'
import { resolvers } from '@hozu/data'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'
import { products } from './data.ts'

const Product = z.object({ sku: z.string(), name: z.string(), price: z.number() })
const listProducts = query({
  input: z.object({}),
  output: z.array(Product),
  scope: 'public',
  freshness: 'static',
  tags: () => [],
  runs: 'server',
})
const Add = event({ payload: z.object({ sku: z.string() }) })
const cart = machine({
  context: z.object({ count: z.number() }),
  initialContext: { count: 0 },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Add, {
          target: 'ready',
          assign: () => {
            ctx.count += 1
          },
        }),
      ],
    },
  }),
})
const Page = ui.view({
  machine: cart,
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
const counts = contract(cart, {
  given: { state: 'ready' },
  when: [
    { send: Add, payload: { sku: 'a' } },
    { send: Add, payload: { sku: 'b' } },
  ],
  expect: { state: 'ready', changes: { count: 2 } },
})
const home = route({ path: '/', params: null, search: null })
const shop = feature({
  id: 'shop',
  intent: { summary: 'Benchmark page' },
  declarations: [{ Add, listProducts, Page, cart, counts }],
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
  routes: { home },
  pages: [ui.page(home, { views: [Page], head: { render: () => headFields } })],
  features: [shop],
})
export const benchResolvers = resolvers(benchProject, (implement) => [
  implement(listProducts, () => products),
])
