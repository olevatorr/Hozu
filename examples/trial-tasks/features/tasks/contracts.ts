import { contract } from '@tenon/core'
import { addTask, clearDone, toggleTask } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { DUPLICATE, INVALID, tasksMachine } from './machine.ts'

const idle = { show: 'all', draft: '', priority: 'normal', target: '', error: null } as const

export const showsDone = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', context: { ...idle, show: 'done' }, effects: [] },
})

export const typesDraft = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'Ship' }, effects: [] },
})

export const addsTask = contract(tasksMachine, {
  given: { state: 'idle', context: { ...idle, error: 'old' } },
  when: [
    { send: Add, payload: { title: 'Test it', priority: 'high' } },
    { send: Draft, payload: { text: 'ignored while adding' } },
    { send: ClearDone, payload: {} },
    { done: addTask, result: { id: 't4', title: 'Test it', done: false, priority: 'high' } },
  ],
  expect: {
    state: 'idle',
    context: idle,
    effects: [{ effect: addTask, input: { title: 'Test it', priority: 'high' } }],
  },
})

export const rejectsDuplicate = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'Ship it', priority: 'low' } },
  when: [{ failed: addTask, error: 'Duplicate', data: { title: 'Ship it' } }],
  expect: {
    state: 'idle',
    context: { ...idle, draft: 'Ship it', priority: 'low', error: DUPLICATE },
    effects: [],
  },
})

export const rejectsInvalid = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'ab' } },
  when: [{ failed: addTask, error: 'Invalid', data: { title: 'ab' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'ab', error: INVALID }, effects: [] },
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
    { done: toggleTask, result: { id: 't2', title: 'Build the app', done: true, priority: 'normal' } },
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

export const clearsDone = contract(tasksMachine, {
  given: { state: 'idle', context: { ...idle, show: 'done', error: 'old' } },
  when: [
    { send: ClearDone, payload: {} },
    { send: Toggle, payload: { id: 't2' } },
    { done: clearDone, result: { removed: 1 } },
  ],
  expect: { state: 'idle', context: { ...idle, show: 'done' }, effects: [{ effect: clearDone, input: {} }] },
})

export const clearFails = contract(tasksMachine, {
  given: { state: 'clearing', context: idle },
  when: [{ failed: clearDone, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, error: 'offline' }, effects: [] },
})
