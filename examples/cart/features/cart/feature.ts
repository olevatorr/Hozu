import { feature } from '@hozu/core'
import { catalog } from '../catalog/feature.ts'
import {
  addFailsUnexpectedly,
  addsItem,
  placesOrder,
  rejectsOutOfStock,
  rejectsTooMany,
  setsQuantity,
} from './contracts.ts'
import { addItem, cartTag, cartTotal, checkout, getCart, removeItem } from './effects.ts'
import { AddItem, Checkout, Dismiss, RemoveItem, SetQuantity } from './events.ts'
import { cartMachine } from './machine.ts'
import { CartPanel } from './views.ts'

export const cart = feature({
  id: 'cart',
  intent: {
    summary: 'Signed-in shopping cart: add and remove items, then check out.',
    invariants: [
      'Cart data is user-scoped and never cached publicly',
      'At most 10 units of one item per add',
      'Checkout navigates to the order confirmation route',
    ],
  },
  imports: [catalog],
  declarations: [
    {
      cartTag,
      AddItem,
      RemoveItem,
      Checkout,
      Dismiss,
      SetQuantity,
      getCart,
      addItem,
      removeItem,
      checkout,
      cartTotal,
      CartPanel,
      addFailsUnexpectedly,
      addsItem,
      placesOrder,
      rejectsOutOfStock,
      rejectsTooMany,
      setsQuantity,
      cartMachine,
    },
  ],
  exports: [AddItem, cartTag, CartPanel],
})
