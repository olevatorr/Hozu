import { route } from '@tenonkit/core'
import { ProductKey } from './features/catalog/schemas.ts'

export const home = route({ path: '/', params: null, search: null })
export const orderPlaced = route({ path: '/order/placed', params: null, search: null })
export const product = route({ path: '/products/:sku', params: ProductKey, search: null })
