import { contract } from '@tenon/core'
import { addBookmark, toggleRead } from './effects.ts'
import { Add, Draft, ToggleRead } from './events.ts'
import { bookmarksMachine, DUPLICATE } from './machine.ts'

const idle = { draft: '', kind: 'article', target: '', error: null } as const

export const typesDraft = contract(bookmarksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: Draft, payload: { text: 'Tenon' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'Tenon' }, effects: [] },
})

export const addsBookmark = contract(bookmarksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Add, payload: { title: 'Tenon talk', kind: 'podcast' } },
    { send: Draft, payload: { text: 'ignored while adding' } },
    { done: addBookmark, result: { id: 'b3', title: 'Tenon talk', kind: 'podcast', read: false } },
  ],
  expect: {
    state: 'idle',
    context: { ...idle, kind: 'podcast' },
    effects: [
      { effect: addBookmark, input: { title: 'Tenon talk', kind: 'podcast' } },
      { navigate: '/bookmarks/b3' },
    ],
  },
})

export const rejectsDuplicate = contract(bookmarksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'Tenon talk' } },
  when: [{ failed: addBookmark, error: 'Duplicate', data: { title: 'Tenon talk' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'Tenon talk', error: DUPLICATE }, effects: [] },
})

export const addFails = contract(bookmarksMachine, {
  given: { state: 'adding', context: idle },
  when: [{ failed: addBookmark, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, error: 'offline' }, effects: [] },
})

export const togglesRead = contract(bookmarksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: ToggleRead, payload: { id: 'b1' } },
    { done: toggleRead, result: { id: 'b1', title: 'A', kind: 'article', read: true } },
  ],
  expect: {
    state: 'idle',
    context: { ...idle, target: 'b1' },
    effects: [{ effect: toggleRead, input: { id: 'b1' } }],
  },
})

export const toggleMissing = contract(bookmarksMachine, {
  given: { state: 'toggling', context: { ...idle, target: 'b9' } },
  when: [{ failed: toggleRead, error: 'NotFound', data: { id: 'b9' } }],
  expect: { state: 'idle', context: { ...idle, target: 'b9' }, effects: [] },
})

export const toggleFails = contract(bookmarksMachine, {
  given: { state: 'toggling', context: idle },
  when: [{ failed: toggleRead, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, error: 'offline' }, effects: [] },
})
