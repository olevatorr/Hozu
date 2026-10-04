import { contract } from '@hozu/core'
import { Add, cart } from './model.ts'

export const counts = contract(cart, {
  given: { state: 'ready' },
  when: [
    { send: Add, payload: { sku: 'a' } },
    { send: Add, payload: { sku: 'b' } },
  ],
  expect: { state: 'ready', changes: { count: 2 } },
})
