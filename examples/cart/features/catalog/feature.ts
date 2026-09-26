import { feature } from '@hozu/core'
import { catalogTag, getProduct, listProducts, productTag } from './effects.ts'
import { ProductDetail, ProductGrid } from './views.ts'

export const catalog = feature({
  id: 'catalog',
  intent: {
    summary: 'Public product catalog. Read-only, cacheable, ships no JavaScript.',
    invariants: ['Only public data', 'No machine: every node is static or revalidated'],
  },
  declarations: { catalogTag, productTag, listProducts, getProduct, ProductGrid, ProductDetail },
  exports: [listProducts, catalogTag, ProductGrid],
})
