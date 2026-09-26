import { project, ui } from '@tenonkit/core'
import { zodAdapter } from '@tenonkit/schema-zod'
import { z } from 'zod'
import { PublicEnv, ServerEnv } from './env.ts'
import { cart } from './features/cart/feature.ts'
import { CartPanel } from './features/cart/views.ts'
import { getProduct, listProducts } from './features/catalog/effects.ts'
import { catalog } from './features/catalog/feature.ts'
import { ProductDetail, ProductGrid } from './features/catalog/views.ts'
import { home, orderPlaced, product } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  env: { server: ServerEnv, public: PublicEnv },
  session: z.object({ userId: z.string() }),
  site: { url: 'https://cart.tenon.dev', name: 'Tenon Cart', lang: 'en' },
  routes: { home, orderPlaced, product },
  pages: [
    ui.page(home, {
      views: [ProductGrid, CartPanel],
      head: {
        render: () => ({
          title: 'Shop mugs and tees — Tenon Cart',
          description: 'A demo store built with Tenon: server-rendered catalog, interactive cart islands.',
        }),
      },
    }),
    ui.page(product, {
      views: [ProductDetail, CartPanel],
      head: {
        query: getProduct,
        input: (params) => ({ sku: params.sku }),
        render: (item) => ({ title: item.name, description: item.name }),
      },
      entries: { query: listProducts, input: {}, params: (item) => ({ sku: item.sku }) },
    }),
    ui.page(orderPlaced, {
      views: [ProductGrid],
      assert: 'cacheable',
      head: {
        render: () => ({
          title: 'Order placed — Tenon Cart',
          description: 'Thanks for your order.',
          noindex: true,
        }),
      },
    }),
  ],
  features: [catalog, cart],
})
