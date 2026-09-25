import { z } from 'zod'

export const Line = z.object({ sku: z.string(), qty: z.number().int().positive() })
export const Item = z.object({ sku: z.string(), name: z.string(), price: z.number(), qty: z.number().int() })
export const Cart = z.object({ items: z.array(Item) })
export const SkuOnly = z.object({ sku: z.string() })
export const NoInput = z.object({})
export const Context = z.object({
  pending: Line,
  error: z.string().nullable(),
  orderId: z.string().nullable(),
})
