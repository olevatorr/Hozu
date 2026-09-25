import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { Product } from './data.ts'

export function App({ products }: { products: Product[] }) {
  const [count, setCount] = useState(0)
  return h(
    'main',
    null,
    h('h1', null, 'Products'),
    h(
      'ul',
      null,
      products.map((p) =>
        h(
          'li',
          { key: p.sku },
          h('strong', null, p.name),
          ' — $',
          p.price,
          h('button', { type: 'button', onClick: () => setCount((c) => c + 1) }, 'Add'),
        ),
      ),
    ),
    h('p', null, 'Cart: ', count, ' items'),
  )
}
