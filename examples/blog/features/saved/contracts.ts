import { contract } from '@tenonkit/core'
import { savePost, unsavePost } from './effects.ts'
import { Save, savedMachine, Unsave } from './machine.ts'

const idle = { slug: '', error: null }

export const savesPost = contract(savedMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Save, payload: { slug: 'hello-tenon' } },
    { done: savePost, result: ['hello-tenon'] },
  ],
  expect: {
    state: 'idle',
    changes: { slug: 'hello-tenon', error: null },
    effects: [{ effect: savePost, input: { slug: 'hello-tenon' } }],
  },
})

export const refusesWhenFull = contract(savedMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Save, payload: { slug: 'x' } },
    { failed: savePost, error: 'LimitReached', data: { limit: 20 } },
  ],
  expect: {
    state: 'idle',
    changes: { slug: 'x', error: 'Reading list is full' },
    effects: [{ effect: savePost, input: { slug: 'x' } }],
  },
})

export const saveFails = contract(savedMachine, {
  given: { state: 'saving', context: { slug: 'x', error: null } },
  when: [{ failed: savePost, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { slug: 'x', error: 'offline' } },
})

export const removesPost = contract(savedMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Unsave, payload: { slug: 'x' } },
    { done: unsavePost, result: [] },
  ],
  expect: {
    state: 'idle',
    changes: { slug: 'x', error: null },
    effects: [{ effect: unsavePost, input: { slug: 'x' } }],
  },
})

export const removeFails = contract(savedMachine, {
  given: { state: 'removing', context: { slug: 'x', error: null } },
  when: [{ failed: unsavePost, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { slug: 'x', error: 'offline' } },
})
