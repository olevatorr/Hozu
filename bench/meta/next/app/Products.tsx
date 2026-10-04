'use client'

import { useEffect, useState } from 'react'
import type { Product } from '../data.ts'

export function Products({ products }: { products: Product[] }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const w = window as unknown as { __hydrateStart: number; __hydrated: { start: number; end: number } }
    w.__hydrated = { start: w.__hydrateStart, end: performance.now() }
  }, [])
  return (
    <>
      <ul>
        {products.map((p) => (
          <li key={p.sku}>
            <strong>{p.name}</strong> — ${p.price}
            <button type="button" onClick={() => setCount((c) => c + 1)}>
              Add
            </button>
          </li>
        ))}
      </ul>
      <p>Cart: {count} items</p>
    </>
  )
}
