import { products } from '../data.ts'
import { Products } from './Products.tsx'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <main>
      <h1>Products</h1>
      <Products products={products} />
    </main>
  )
}
