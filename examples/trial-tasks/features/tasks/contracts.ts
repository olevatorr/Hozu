import { contract } from '@tenon/core'
import { addTask, clearDone, toggleTask } from './effects.ts'
import { AddTask, ClearDone, Draft, SetFilter, SetPriority, ToggleTask } from './events.ts'
import { DUPLICATE, INVALID, tasksMachine } from './machine.ts'

const idle = { filter: 'all', draft: '', title: '', priority: 'normal', target: '', error: null } as const

export const filtersTasks = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: SetFilter, payload: { filter: 'done' } }],
  expect: { state: 'idle', context: { ...idle, filter: 'done' }, effects: [] },
})

export const typesDraft = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: Draft, payload: { text: 'Walk' } }],
  expect: { state: 'idle', context: { ...idle, draft: 'Walk' }, effects: [] },
})

export const addsTask = contract(tasksMachine, {
  given: { state: 'idle', context: { ...idle, draft: 'Walk the dog', priority: 'high', error: DUPLICATE } },
  when: [
    { send: AddTask, payload: { title: 'Walk the dog' } },
    { done: addTask, result: { id: 't4', title: 'Walk the dog', done: false, priority: 'high' } },
  ],
  expect: {
    state: 'idle',
    context: idle,
    effects: [{ effect: addTask, input: { title: 'Walk the dog', priority: 'high' } }],
  },
})

export const rejectsDuplicate = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, draft: 'ship it', title: 'ship it' } },
  when: [{ failed: addTask, error: 'Duplicate', data: { title: 'ship it' } }],
  expect: {
    state: 'idle',
    context: { ...idle, draft: 'ship it', title: 'ship it', error: DUPLICATE },
    effects: [],
  },
})

export const rejectsInvalidTitle = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, title: ' a ' } },
  when: [{ failed: addTask, error: 'InvalidTitle', data: { min: 3, max: 80 } }],
  expect: { state: 'idle', context: { ...idle, title: ' a ', error: INVALID }, effects: [] },
})

export const addFails = contract(tasksMachine, {
  given: { state: 'adding', context: { ...idle, title: 'Walk' } },
  when: [{ failed: addTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, title: 'Walk', error: 'offline' }, effects: [] },
})

export const togglesTask = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [
    { send: ToggleTask, payload: { id: 't2' } },
    { done: toggleTask, result: { id: 't2', title: 'Build the app', done: true, priority: 'normal' } },
  ],
  expect: {
    state: 'idle',
    context: { ...idle, target: 't2' },
    effects: [{ effect: toggleTask, input: { id: 't2' } }],
  },
})

export const toggleMissing = contract(tasksMachine, {
  given: { state: 'toggling', context: { ...idle, target: 'nope' } },
  when: [{ failed: toggleTask, error: 'NotFound', data: { id: 'nope' } }],
  expect: { state: 'idle', context: { ...idle, target: 'nope', error: 'Task not found' }, effects: [] },
})

export const toggleFails = contract(tasksMachine, {
  given: { state: 'toggling', context: { ...idle, target: 't1' } },
  when: [{ failed: toggleTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, target: 't1', error: 'offline' }, effects: [] },
})

export const setsLowPriority = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: SetPriority, payload: { priority: 'low' } }],
  expect: { state: 'idle', context: { ...idle, priority: 'low' }, effects: [] },
})

export const setsHighPriority = contract(tasksMachine, {
  given: { state: 'idle', context: idle },
  when: [{ send: SetPriority, payload: { priority: 'high' } }],
  expect: { state: 'idle', context: { ...idle, priority: 'high' }, effects: [] },
})

export const setsNormalPriority = contract(tasksMachine, {
  given: { state: 'idle', context: { ...idle, priority: 'high' } },
  when: [{ send: SetPriority, payload: { priority: 'normal' } }],
  expect: { state: 'idle', context: idle, effects: [] },
})

export const clearsDone = contract(tasksMachine, {
  given: { state: 'idle', context: { ...idle, error: 'offline' } },
  when: [
    { send: ClearDone, payload: {} },
    { done: clearDone, result: { removed: 1 } },
  ],
  expect: { state: 'idle', context: idle, effects: [{ effect: clearDone, input: {} }] },
})

export const clearFails = contract(tasksMachine, {
  given: { state: 'clearing', context: idle },
  when: [{ failed: clearDone, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', context: { ...idle, error: 'offline' }, effects: [] },
})
