import { project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { cart } from './features/cart/feature.ts'
import { catalog } from './features/catalog/feature.ts'
import { home, orderPlaced } from './routes.ts'

export default project({
  schema: zodAdapter,
  session: z.object({ userId: z.string() }),
  routes: { home, orderPlaced },
  features: [catalog, cart],
})
