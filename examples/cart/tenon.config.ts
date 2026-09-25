import { project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { cart } from './features/cart/feature.ts'
import { CartPanel } from './features/cart/views.ts'
import { catalog } from './features/catalog/feature.ts'
import { ProductGrid } from './features/catalog/views.ts'
import { home, orderPlaced } from './routes.ts'

export default project({
  schema: zodAdapter,
  session: z.object({ userId: z.string() }),
  routes: { home, orderPlaced },
  pages: [
    { route: home, views: [ProductGrid, CartPanel], assert: null },
    { route: orderPlaced, views: [ProductGrid], assert: 'cacheable' },
  ],
  features: [catalog, cart],
})
