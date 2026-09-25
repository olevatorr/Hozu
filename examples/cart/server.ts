import { resolvers } from '@tenon/data'
import { addItem, checkout, getCart, removeItem } from './features/cart/effects.ts'
import { getProduct, listProducts } from './features/catalog/effects.ts'
import project from './tenon.config.ts'

interface Line {
  sku: string
  qty: number
}

export function createResolvers() {
  const products = [
    { sku: 'mug', name: 'Mug', price: 12 },
    { sku: 'tee', name: 'T-shirt', price: 25 },
  ]
  const stock = new Map([
    ['mug', 3],
    ['tee', 0],
  ])
  const carts = new Map<string, Line[]>()
  let orders = 0

  const cartOf = (userId: string) => {
    const lines = carts.get(userId) ?? []
    return {
      items: lines.map((line) => {
        const product = products.find((p) => p.sku === line.sku)!
        return { sku: line.sku, name: product.name, price: product.price, qty: line.qty }
      }),
    }
  }

  return resolvers(project, (implement) => [
    implement(listProducts, () => products),
    implement(
      getProduct,
      ({ sku }, { fail }) => products.find((p) => p.sku === sku) ?? fail('NotFound', { sku }),
    ),
    implement(getCart, (_, { session }) => cartOf(session.userId)),
    implement(addItem, ({ sku, qty }, { session, fail }) => {
      const available = stock.get(sku) ?? 0
      if (available < qty) return fail('OutOfStock', { sku, available })
      stock.set(sku, available - qty)
      const lines = carts.get(session.userId) ?? []
      const line = lines.find((l) => l.sku === sku)
      carts.set(
        session.userId,
        line ? lines.map((l) => (l === line ? { sku, qty: l.qty + qty } : l)) : [...lines, { sku, qty }],
      )
      return cartOf(session.userId)
    }),
    implement(removeItem, ({ sku }, { session }) => {
      carts.set(
        session.userId,
        (carts.get(session.userId) ?? []).filter((l) => l.sku !== sku),
      )
      return cartOf(session.userId)
    }),
    implement(checkout, (_, { session, fail }) => {
      if (!(carts.get(session.userId) ?? []).length)
        return fail('PaymentDeclined', { reason: 'Cart is empty' })
      carts.delete(session.userId)
      return { orderId: `order-${++orders}` }
    }),
  ])
}
