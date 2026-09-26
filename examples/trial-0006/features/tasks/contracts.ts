import { contract } from '@tenon/core'
import { addTask, toggleTask } from './effects.ts'
import { Add, Draft, SetShow, Toggle } from './events.ts'
import { DUPLICATE, tasksMachine } from './machine.ts'

const idle = { show: 'all', draft: '', target: '', error: null, fields: { title: null } } as const

export const typesDraft = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'Ship' }, effects: [] },
})

export const filtersDone = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', context: { ...idle, show: 'done' }, effects: [] },
})

export const addsTask = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Add, payload: { title: 'Test it' } },
    { send: Draft, payload: { text: 'ignored while adding' } },
    { done: addTask, result: { id: 't4', title: 'Test it', done: false } },
  ],
  expect: { state: 'idle', context: idle, effects: [{ effect: addTask, input: { title: 'Test it' } }] },
})

export const rejectsDuplicate = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'Ship it' } },
  when: [{ failed: addTask, error: 'Duplicate', data: { title: 'Ship it' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'Ship it', error: DUPLICATE }, effects: [] },
})

export const rejectsInvalidTitle = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'x' } },
  when: [
    {
      failed: addTask,
      error: 'Invalid',
      data: { message: 'title: Use at least 3 characters', fields: { title: 'Use at least 3 characters' } },
    },
  ],
  expect: {
    state: 'idle',
    context: { ...idle, draft: 'x', fields: { title: 'Use at least 3 characters' } },
    effects: [],
  },
})

export const addFails = contract(tasksMachine, {
  given: { state: 'adding', context: idle },
  when: [{ failed: addTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, error: 'offline' }, effects: [] },
})

export const togglesTask = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Toggle, payload: { id: 't2' } },
    { done: toggleTask, result: { id: 't2', title: 'Build the app', done: true } },
  ],
  expect: {
    state: 'idle',
    context: { ...idle, target: 't2' },
    effects: [{ effect: toggleTask, input: { id: 't2' } }],
  },
})

export const toggleMissing = contract(tasksMachine, {
  given: { state: 'toggling', context: { ...idle, target: 't9' } },
  when: [{ failed: toggleTask, error: 'NotFound', data: { id: 't9' } }],
  expect: { state: 'idle', context: { ...idle, target: 't9' }, effects: [] },
})

export const toggleFails = contract(tasksMachine, {
  given: { state: 'toggling', context: idle },
  when: [{ failed: toggleTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, error: 'offline' }, effects: [] },
})
