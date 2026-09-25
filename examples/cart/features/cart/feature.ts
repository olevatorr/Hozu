import { feature } from '@tenon/core'
import { catalog } from '../catalog/feature.ts'
import {
  addFailsUnexpectedly,
  addsItem,
  checkoutFails,
  dismissesError,
  errorAutoDismisses,
  paymentDeclined,
  placesOrder,
  rejectsOutOfStock,
  rejectsTooMany,
  removeFails,
  removesItem,
  setsQuantity,
} from './contracts.ts'
import { addItem, cartTag, cartTotal, checkout, getCart, removeItem } from './effects.ts'
import { AddItem, Checkout, Dismiss, RemoveItem, SetQuantity } from './events.ts'
import { cartMachine } from './machine.ts'
import { CartPanel } from './views.ts'

export const cart = feature({
  id: 'cart',
  styles: [],
  intent: {
    summary: 'Signed-in shopping cart: add and remove items, then check out.',
    invariants: [
      'Cart data is user-scoped and never cached publicly',
      'At most 10 units of one item per add',
      'Checkout navigates to the order confirmation route',
    ],
  },
  imports: [catalog],
  tags: { cartTag },
  events: { AddItem, RemoveItem, Checkout, Dismiss, SetQuantity },
  queries: { getCart },
  mutations: { addItem, removeItem, checkout },
  fns: { cartTotal },
  machine: cartMachine,
  views: { CartPanel },
  contracts: {
    addFailsUnexpectedly,
    addsItem,
    checkoutFails,
    dismissesError,
    errorAutoDismisses,
    paymentDeclined,
    placesOrder,
    rejectsOutOfStock,
    rejectsTooMany,
    removeFails,
    removesItem,
    setsQuantity,
  },
  exports: { events: [AddItem], queries: [], mutations: [], tags: [cartTag], fns: [], views: [CartPanel] },
})
