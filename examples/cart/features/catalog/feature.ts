import { feature } from '@tenon/core'
import { catalogTag, getProduct, listProducts, productTag } from './effects.ts'
import { ProductDetail, ProductGrid } from './views.ts'

export const catalog = feature({
  id: 'catalog',
  styles: [],
  widgets: {},
  intent: {
    summary: 'Public product catalog. Read-only, cacheable, ships no JavaScript.',
    invariants: ['Only public data', 'No machine: every node is static or revalidated'],
  },
  imports: [],
  tags: { catalogTag, productTag },
  events: {},
  queries: { listProducts, getProduct },
  mutations: {},
  fns: {},
  machine: null,
  views: { ProductGrid, ProductDetail },
  contracts: {},
  exports: {
    events: [],
    queries: [listProducts],
    mutations: [],
    tags: [catalogTag],
    fns: [],
    views: [ProductGrid],
  },
})
