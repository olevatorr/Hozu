import { fn, mutation, query, tag } from '@tenonkit/core'
import { z } from 'zod'
import { Cart, Item, Line, NoInput, SkuOnly } from './schemas.ts'

export const cartTag = tag({ param: null })

export const getCart = query({
  input: NoInput,
  output: Cart,
  scope: 'user',
  freshness: { swr: 30 },
  tags: () => [cartTag()],
})

export const addItem = mutation({
  input: Line,
  output: Cart,
  errors: { OutOfStock: z.object({ sku: z.string(), available: z.number().int() }) },
  invalidates: () => [cartTag()],
})

export const removeItem = mutation({ input: SkuOnly, output: Cart, invalidates: () => [cartTag()] })

export const checkout = mutation({
  input: NoInput,
  output: z.object({ orderId: z.string() }),
  errors: { PaymentDeclined: z.object({ reason: z.string() }) },
  invalidates: () => [cartTag()],
})

export const cartTotal = fn({
  input: z.array(Item),
  output: z.number(),
  impl: (items) => items.reduce((sum, item) => sum + item.price * item.qty, 0),
})
