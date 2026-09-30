import { feature } from '@hozu/core'
import { addTask, clearDone, getTask, isEmpty, listTasks, tasksTag, toggleTask, visible } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { tasksMachine } from './machine.ts'
import { Board, Detail } from './views.ts'

export const tasks = feature({
  id: 'tasks',
  intent: {
    summary:
      'A task board: add tasks with a priority, toggle them done, clear done tasks, filter in the browser, one page per task.',
    invariants: ['Titles are unique, case-insensitive', 'New tasks are listed first'],
  },
  declarations: [
    {
      tasksTag,
      Draft,
      Add,
      Toggle,
      SetShow,
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
      tasksMachine,
    },
  ],
})
