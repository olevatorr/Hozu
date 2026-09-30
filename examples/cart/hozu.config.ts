import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
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
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  env: { server: ServerEnv, public: PublicEnv },
  session: z.object({ userId: z.string() }),
  site: { url: 'https://cart.hozu.dev', name: 'Hozu Cart', lang: 'en' },
  routes: { home, orderPlaced, product },
  pages: [
    ui.page(home, {
      views: [ProductGrid, CartPanel],
      head: {
        render: () => ({
          title: 'Shop mugs and tees — Hozu Cart',
          description: 'A demo store built with Hozu: server-rendered catalog, interactive cart islands.',
        }),
      },
    }),
    ui.page(product, {
      views: [ProductDetail, CartPanel],
      head: {
        query: getProduct,
        input: (params) => ({ sku: params.sku }),
        failed: { NotFound: 404 },
        render: (item) => ({ title: item.name, description: item.name }),
      },
      entries: { query: listProducts, input: {}, params: (item) => ({ sku: item.sku }) },
    }),
    ui.page(orderPlaced, {
      views: [ProductGrid],
      assert: 'cacheable',
      head: {
        render: () => ({
          title: 'Order placed — Hozu Cart',
          description: 'Thanks for your order.',
          noindex: true,
        }),
      },
    }),
  ],
  features: [catalog, cart],
})
