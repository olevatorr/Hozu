import { contract } from '@hozu/core'
import {
  AddTodo,
  Draft,
  RemoveTodo,
  SelectMetric,
  SelectTab,
  Shuffle,
  SlideChanged,
  ToggleSpin,
} from './events.ts'
import { siteMachine } from './machine.ts'

const start = {
  tab: 'design' as const,
  todos: [{ id: 't1', title: 'A' }],
  draft: '',
  next: 2,
  metric: 'visits' as const,
  slide: 0,
  spin: true,
}

export const interactions = contract(siteMachine, {
  given: { state: 'ready', context: start },
  when: [
    { send: SelectTab, payload: { tab: 'ship' } },
    { send: Draft, payload: { text: 'B' } },
    { send: AddTodo, payload: { title: 'B' } },
    { send: AddTodo, payload: { title: '' } },
    { send: Shuffle, payload: {} },
    { send: RemoveTodo, payload: { id: 't1' } },
    { send: SelectMetric, payload: { metric: 'visits' } },
    { send: SelectMetric, payload: { metric: 'signups' } },
    { send: SlideChanged, payload: { index: 2 } },
    { send: ToggleSpin, payload: {} },
  ],
  expect: {
    state: 'ready',
    changes: {
      tab: 'ship',
      todos: [{ id: 't2', title: 'B' }],
      draft: '',
      next: 3,
      metric: 'signups',
      slide: 2,
      spin: false,
    },
  },
})

export const addingCountsIds = contract(siteMachine, {
  given: { state: 'ready', context: { next: 7 } },
  when: [
    { send: AddTodo, payload: { title: 'C' } },
    { send: AddTodo, payload: { title: 'D' } },
  ],
  expect: {
    state: 'ready',
    changes: {
      todos: [
        { id: 't1', title: 'Sketch the layout' },
        { id: 't2', title: 'Pick the palette' },
        { id: 't7', title: 'C' },
        { id: 't8', title: 'D' },
      ],
      next: 9,
    },
  },
})
