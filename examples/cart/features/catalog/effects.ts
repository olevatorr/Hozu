import { query, tag } from '@hozu/core'
import { z } from 'zod'
import { NoInput, Product, ProductKey } from './schemas.ts'

export const catalogTag = tag({ param: null })
export const productTag = tag({ param: z.string() })

export const listProducts = query({
  input: NoInput,
  output: z.array(Product),
  scope: 'public',
  freshness: { revalidate: 60 },
  tags: () => [catalogTag()],
  runs: 'server',
})

export const getProduct = query({
  input: ProductKey,
  output: Product,
  errors: { NotFound: ProductKey },
  scope: 'public',
  freshness: 'static',
  tags: (input) => [productTag(input.sku)],
  runs: 'server',
})
