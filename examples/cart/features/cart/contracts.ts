import { contract } from '@hozu/core'
import { addItem, checkout } from './effects.ts'
import { AddItem, Checkout, SetQuantity } from './events.ts'
import { cartMachine } from './machine.ts'

const idle = { pending: { sku: '', qty: 1 }, error: null, orderId: null }

export const addsItem = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: AddItem, payload: { sku: 'mug', qty: 2 } },
    { done: addItem, result: { items: [] } },
  ],
  expect: {
    state: 'idle',
    changes: { pending: { sku: 'mug', qty: 2 }, error: null, orderId: null },
    effects: [{ effect: addItem, input: { sku: 'mug', qty: 2 } }],
  },
})

export const rejectsOutOfStock = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: AddItem, payload: { sku: 'mug', qty: 1 } },
    { failed: addItem, error: 'OutOfStock', data: { sku: 'mug', available: 0 } },
  ],
  expect: {
    state: 'error',
    changes: { pending: { sku: 'mug', qty: 1 }, error: 'Out of stock', orderId: null },
    effects: [{ effect: addItem, input: { sku: 'mug', qty: 1 } }],
  },
})

export const placesOrder = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Checkout, payload: {} },
    { done: checkout, result: { orderId: 'o-1' } },
  ],
  expect: {
    state: 'placed',
    changes: { orderId: 'o-1' },
    effects: [{ effect: checkout, input: {} }, { navigate: '/order/placed' }],
  },
})

export const rejectsTooMany = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: AddItem, payload: { sku: 'mug', qty: 11 } }],
  expect: { state: 'error', changes: { error: 'At most 10 per item' } },
})

export const addFailsUnexpectedly = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: AddItem, payload: { sku: 'mug', qty: 1 } },
    { failed: addItem, error: 'Unexpected', data: { message: 'Network down' } },
  ],
  expect: {
    state: 'error',
    changes: { pending: { sku: 'mug', qty: 1 }, error: 'Network down', orderId: null },
    effects: [{ effect: addItem, input: { sku: 'mug', qty: 1 } }],
  },
})

export const setsQuantity = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: SetQuantity, payload: { qty: 3 } },
    { send: SetQuantity, payload: { qty: 0 } },
    { send: SetQuantity, payload: { qty: null } },
  ],
  expect: { state: 'idle', changes: { pending: { sku: '', qty: 3 } } },
})
