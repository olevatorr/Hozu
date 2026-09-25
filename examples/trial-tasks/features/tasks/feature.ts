import { feature } from '@tenon/core'
import {
  addFails,
  addsTask,
  clearFails,
  clearsDone,
  filtersTasks,
  rejectsDuplicate,
  rejectsInvalidTitle,
  setsHighPriority,
  setsLowPriority,
  setsNormalPriority,
  toggleFails,
  toggleMissing,
  togglesTask,
  typesDraft,
} from './contracts.ts'
import {
  addTask,
  clearDone,
  getTask,
  listTasks,
  noneVisible,
  tasksTag,
  taskTag,
  toggleTask,
  visibleTasks,
} from './effects.ts'
import { AddTask, ClearDone, Draft, SetFilter, SetPriority, ToggleTask } from './events.ts'
import { tasksMachine } from './machine.ts'
import { Board, Detail } from './views.ts'

export const tasks = feature({
  id: 'tasks',
  styles: [],
  widgets: {},
  intent: {
    summary:
      'Shared task board: add tasks with a priority, toggle them, clear done ones, filter in the browser, one page per task.',
    invariants: [
      'Titles are trimmed and 3–80 characters',
      'Titles are unique, case-insensitive',
      'New tasks are listed first',
      'Every task has a priority: low, normal or high (default normal)',
      'Clear done deletes every done task on the server',
    ],
  },
  imports: [],
  tags: { tasksTag, taskTag },
  events: { SetFilter, Draft, SetPriority, AddTask, ToggleTask, ClearDone },
  queries: { listTasks, getTask },
  mutations: { addTask, toggleTask, clearDone },
  fns: { visibleTasks, noneVisible },
  machine: tasksMachine,
  views: { Board, Detail },
  contracts: {
    filtersTasks,
    typesDraft,
    addsTask,
    rejectsDuplicate,
    rejectsInvalidTitle,
    addFails,
    togglesTask,
    toggleMissing,
    toggleFails,
    setsLowPriority,
    setsHighPriority,
    setsNormalPriority,
    clearsDone,
    clearFails,
  },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
