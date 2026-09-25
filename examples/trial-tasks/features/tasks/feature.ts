import { feature } from '@tenon/core'
import * as contracts from './contracts.ts'
import { addTask, clearDone, getTask, isEmpty, listTasks, tasksTag, toggleTask, visible } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { tasksMachine } from './machine.ts'
import { Board, Detail } from './views.ts'

export const tasks = feature({
  id: 'tasks',
  styles: [],
  widgets: {},
  intent: {
    summary:
      'A task board: add tasks with a priority, toggle them done or open, clear done tasks, filter by status, one page each.',
    invariants: ['Titles are unique, case-insensitive, 3 to 80 characters', 'New tasks are listed first'],
  },
  imports: [],
  tags: { tasksTag },
  events: { SetShow, Draft, Add, Toggle, ClearDone },
  queries: { listTasks, getTask },
  mutations: { addTask, toggleTask, clearDone },
  fns: { visible, isEmpty },
  machine: tasksMachine,
  views: { Board, Detail },
  contracts: { ...contracts },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
