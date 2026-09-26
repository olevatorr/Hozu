import { contract } from '@hozu/core'
import { More } from './events.ts'
import { feedMachine } from './machine.ts'

export const loadsNextPage = contract(feedMachine, {
  given: { state: 'idle', context: { cursors: [null], last: null } },
  when: [{ send: More, payload: { cursor: 'c10' } }],
  expect: { state: 'idle', changes: { cursors: [null, 'c10'], last: 'c10' } },
})

export const ignoresARepeatedCursor = contract(feedMachine, {
  given: { state: 'idle', context: { cursors: [null, 'c10'], last: 'c10' } },
  when: [{ send: More, payload: { cursor: 'c10' } }],
  expect: { state: 'idle' },
})
