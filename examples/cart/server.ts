import { resolvers } from '@tenonkit/data'
import { addItem, checkout, getCart, removeItem } from './features/cart/effects.ts'
import { getProduct, listProducts } from './features/catalog/effects.ts'
import project from './tenon.config.ts'

interface Line {
  sku: string
  qty: number
}

const who = (session: { userId: string } | null) => session?.userId ?? 'guest'

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
    implement(getCart, (_, { session }) => cartOf(who(session))),
    implement(addItem, ({ sku, qty }, { session, fail, env }) => {
      const available = Math.min(stock.get(sku) ?? 0, env.STOCK_LIMIT)
      if (available < qty) return fail('OutOfStock', { sku, available })
      stock.set(sku, available - qty)
      const lines = carts.get(who(session)) ?? []
      const line = lines.find((l) => l.sku === sku)
      carts.set(
        who(session),
        line ? lines.map((l) => (l === line ? { sku, qty: l.qty + qty } : l)) : [...lines, { sku, qty }],
      )
      return cartOf(who(session))
    }),
    implement(removeItem, ({ sku }, { session }) => {
      carts.set(
        who(session),
        (carts.get(who(session)) ?? []).filter((l) => l.sku !== sku),
      )
      return cartOf(who(session))
    }),
    implement(checkout, (_, { session, fail }) => {
      if (!(carts.get(who(session)) ?? []).length) return fail('PaymentDeclined', { reason: 'Cart is empty' })
      carts.delete(who(session))
      return { orderId: `order-${++orders}` }
    }),
  ])
}
