import { resolvers } from '@hozu/data'
import { addTask, clearDone, getTask, listTasks, toggleTask } from './features/tasks/model.ts'
import project from './hozu.config.ts'

type Priority = 'low' | 'normal' | 'high'

const tasks: { id: string; title: string; done: boolean; priority: Priority }[] = [
  { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
  { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
  { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
]
let seq = tasks.length

export function createResolvers() {
  return resolvers(project, (implement) => [
    implement(listTasks, () => tasks.map((t) => ({ ...t }))),
    implement(getTask, ({ id }, { fail }) => {
      const task = tasks.find((t) => t.id === id)
      return task ? { ...task } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, priority }, { fail }) => {
      const clean = title.trim()
      if (clean.length < 3 || clean.length > 80) {
        const message = clean.length < 3 ? 'Use at least 3 characters' : 'Use at most 80 characters'
        return fail('Invalid', { message: `title: ${message}`, fields: { title: message, priority: null } })
      }
      if (tasks.some((t) => t.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const task = { id: `t${++seq}`, title: clean, done: false, priority }
      tasks.unshift(task)
      return { ...task }
    }),
    implement(toggleTask, ({ id }, { fail }) => {
      const task = tasks.find((t) => t.id === id)
      if (!task) return fail('NotFound', { id })
      task.done = !task.done
      return { ...task }
    }),
    implement(clearDone, () => {
      const before = tasks.length
      const open = tasks.filter((t) => !t.done)
      tasks.splice(0, tasks.length, ...open)
      return { removed: before - open.length }
    }),
  ])
}
