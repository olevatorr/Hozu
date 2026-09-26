import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { cart } from './features/cart/feature.ts'
import { CartPanel } from './features/cart/views.ts'
import { getProduct, listProducts } from './features/catalog/effects.ts'
import { catalog } from './features/catalog/feature.ts'
import { ProductDetail, ProductGrid } from './features/catalog/views.ts'
import { home, orderPlaced, product } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  http: null,
  notFound: null,
  error: null,
  session: z.object({ userId: z.string() }),
  site: {
    url: 'https://cart.tenon.dev',
    name: 'Tenon Cart',
    locales: null,
    lang: 'en',
    icon: null,
    themeColor: null,
  },
  routes: { home, orderPlaced, product },
  pages: [
    ui.page(home, {
      views: [ProductGrid, CartPanel],
      assert: null,
      head: {
        redirects: null,
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
    ui.page(product, {
      views: [ProductDetail, CartPanel],
      assert: null,
      head: {
        redirects: null,
        query: getProduct,
        input: (params) => ({ sku: params.sku }),
        render: (item) => ({
          title: item.name,
          description: item.name,
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: { query: listProducts, input: {}, params: (item) => ({ sku: item.sku }) },
    }),
    ui.page(orderPlaced, {
      views: [ProductGrid],
      assert: 'cacheable',
      head: {
        redirects: null,
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
