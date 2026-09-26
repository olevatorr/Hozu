import { feature } from '@tenon/core'
import * as contracts from './contracts.ts'
import { addTask, getTask, isEmpty, listTasks, tasksTag, toggleTask, visible } from './effects.ts'
import { Add, Draft, SetShow, Toggle } from './events.ts'
import { tasksMachine } from './machine.ts'
import { Board, Detail } from './views.ts'

export const tasks = feature({
  id: 'tasks',
  styles: [],
  messages: null,
  widgets: {},
  intent: {
    summary: 'A task board: add tasks, toggle them done, filter in the browser, one page per task.',
    invariants: ['Titles are unique, case-insensitive', 'New tasks are listed first'],
  },
  imports: [],
  tags: { tasksTag },
  events: { Draft, Add, Toggle, SetShow },
  queries: { listTasks, getTask },
  mutations: { addTask, toggleTask },
  fns: { visible, isEmpty },
  machine: tasksMachine,
  views: { Board, Detail },
  contracts: { ...contracts },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
