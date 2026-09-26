import { contract } from '@tenon/core'
import { More } from './events.ts'
import { feedMachine } from './machine.ts'

export const loadsNextPage = contract(feedMachine, {
  given: { state: 'idle', context: { cursors: [null], last: null } },
  when: [{ send: More, payload: { cursor: 'c10' } }],
  expect: { state: 'idle', context: { cursors: [null, 'c10'], last: 'c10' }, effects: [] },
})

export const ignoresARepeatedCursor = contract(feedMachine, {
  given: { state: 'idle', context: { cursors: [null, 'c10'], last: 'c10' } },
  when: [{ send: More, payload: { cursor: 'c10' } }],
  expect: { state: 'idle', context: { cursors: [null, 'c10'], last: 'c10' }, effects: [] },
})
