import { contract } from '@tenonkit/core'
import { addTask, clearDone, toggleTask } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { DUPLICATE, tasksMachine } from './machine.ts'

const idle = {
  show: 'all',
  draft: '',
  priority: 'normal',
  target: '',
  error: null,
  fields: { title: null, priority: null },
} as const

export const typesDraft = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', changes: { draft: 'Ship' } },
})

export const filtersDone = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', changes: { show: 'done' } },
})

export const addsTask = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Add, payload: { title: 'Test it', priority: 'high' } },
    { send: Draft, payload: { text: 'ignored while adding' } },
    { done: addTask, result: { id: 't4', title: 'Test it', done: false, priority: 'high' } },
  ],
  expect: { state: 'idle', effects: [{ effect: addTask, input: { title: 'Test it', priority: 'high' } }] },
})

export const rejectsDuplicate = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'Ship it' } },
  when: [{ failed: addTask, error: 'Duplicate', data: { title: 'Ship it' } }],
  expect: { state: 'idle', changes: { ...idle, draft: 'Ship it', error: DUPLICATE } },
})

export const rejectsInvalidTitle = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'x' } },
  when: [
    {
      failed: addTask,
      error: 'Invalid',
      data: {
        message: 'title: Use at least 3 characters',
        fields: { title: 'Use at least 3 characters', priority: null },
      },
    },
  ],
  expect: {
    state: 'idle',
    changes: { ...idle, draft: 'x', fields: { title: 'Use at least 3 characters', priority: null } },
  },
})

export const addFails = contract(tasksMachine, {
  given: { state: 'adding', context: idle },
  when: [{ failed: addTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const togglesTask = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Toggle, payload: { id: 't2' } },
    { done: toggleTask, result: { id: 't2', title: 'Build the app', done: true, priority: 'normal' } },
  ],
  expect: {
    state: 'idle',
    changes: { target: 't2' },
    effects: [{ effect: toggleTask, input: { id: 't2' } }],
  },
})

export const toggleMissing = contract(tasksMachine, {
  given: { state: 'toggling', context: { ...idle, target: 't9' } },
  when: [{ failed: toggleTask, error: 'NotFound', data: { id: 't9' } }],
  expect: { state: 'idle' },
})

export const toggleFails = contract(tasksMachine, {
  given: { state: 'toggling', context: idle },
  when: [{ failed: toggleTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const clearsDone = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: ClearDone, payload: {} },
    { send: Toggle, payload: { id: 't2' } },
    { done: clearDone, result: { removed: 1 } },
  ],
  expect: { state: 'idle', effects: [{ effect: clearDone, input: {} }] },
})

export const clearFails = contract(tasksMachine, {
  given: { state: 'clearing', context: idle },
  when: [{ failed: clearDone, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})
