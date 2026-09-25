import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { cart } from './features/cart/feature.ts'
import { CartPanel } from './features/cart/views.ts'
import { catalog } from './features/catalog/feature.ts'
import { ProductGrid } from './features/catalog/views.ts'
import { home, orderPlaced } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: null,
  session: z.object({ userId: z.string() }),
  site: { url: 'https://cart.tenon.dev', name: 'Tenon Cart', lang: 'en' },
  routes: { home, orderPlaced },
  pages: [
    ui.page(home, {
      views: [ProductGrid, CartPanel],
      assert: null,
      head: {
        query: null,
        input: null,
        render: () => ({
          title: 'Shop mugs and tees — Tenon Cart',
          description: 'A demo store built with Tenon: server-rendered catalog, interactive cart islands.',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
    ui.page(orderPlaced, {
      views: [ProductGrid],
      assert: 'cacheable',
      head: {
        query: null,
        input: null,
        render: () => ({
          title: 'Order placed — Tenon Cart',
          description: 'Thanks for your order.',
          type: 'website',
          image: null,
          published: null,
          noindex: true,
        }),
      },
      entries: null,
    }),
  ],
  features: [catalog, cart],
})
