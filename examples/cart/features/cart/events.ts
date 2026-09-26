import { event } from '@tenonkit/core'
import { Line, NoInput, Quantity, SkuOnly } from './schemas.ts'

export const AddItem = event({ payload: Line })
export const RemoveItem = event({ payload: SkuOnly })
export const Checkout = event({ payload: NoInput })
export const Dismiss = event({ payload: NoInput })
export const SetQuantity = event({ payload: Quantity })
