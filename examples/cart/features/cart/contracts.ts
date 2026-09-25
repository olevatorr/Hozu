import { contract } from '@tenon/core'
import { addItem, checkout } from './effects.ts'
import { AddItem, Checkout } from './events.ts'
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
    context: { pending: { sku: 'mug', qty: 2 }, error: null, orderId: null },
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
    context: { pending: { sku: 'mug', qty: 1 }, error: 'Out of stock', orderId: null },
    effects: null,
  },
})

export const errorAutoDismisses = contract(cartMachine, {
  given: { state: 'error', context: { ...idle, error: 'Out of stock' } },
  when: [{ elapse: 5000 }],
  expect: { state: 'idle', context: idle, effects: [] },
})

export const placesOrder = contract(cartMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Checkout, payload: {} },
    { done: checkout, result: { orderId: 'o-1' } },
  ],
  expect: {
    state: 'placed',
    context: { ...idle, orderId: 'o-1' },
    effects: [{ effect: checkout, input: {} }],
  },
})
