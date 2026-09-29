import { feature } from '@hozu/core'
import * as contracts from './contracts.ts'
import { addTask, clearDone, getTask, isEmpty, listTasks, tasksTag, toggleTask, visible } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { tasksMachine } from './machine.ts'
import { Board, Detail } from './views.ts'

export const tasks = feature({
  id: 'tasks',
  intent: {
    summary:
      'A task board: add tasks with a priority, toggle them done or open, clear done tasks, filter by status, one page each.',
    invariants: ['Titles are unique, case-insensitive, 3 to 80 characters', 'New tasks are listed first'],
  },
  declarations: [
    {
      tasksTag,
      SetShow,
      Draft,
      Add,
      Toggle,
      ClearDone,
      listTasks,
      getTask,
      addTask,
      toggleTask,
      clearDone,
      visible,
      isEmpty,
      Board,
      Detail,
      ...contracts,
      tasksMachine,
    },
  ],
})
