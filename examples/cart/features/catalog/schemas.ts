import { z } from 'zod'

export const Product = z.object({ sku: z.string(), name: z.string(), price: z.number() })
export const ProductKey = z.object({ sku: z.string() })
export const NoInput = z.object({})
