import { resolvers } from '@tenonkit/data'
import { addTask, clearDone, getTask, listTasks, toggleTask } from './features/tasks/model.ts'
import project from './tenon.config.ts'

const tasks: { id: string; title: string; done: boolean; priority: 'low' | 'normal' | 'high' }[] = [
  { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
  { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
  { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
]
let seq = tasks.length

export function createResolvers() {
  return resolvers(project, (implement) => [
    implement(listTasks, () => tasks.map((t) => ({ ...t }))),
    implement(getTask, ({ id }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      return t ? { ...t } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, priority }, { fail }) => {
      const clean = title.trim()
      if (tasks.some((t) => t.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const t = { id: `t${++seq}`, title: clean, done: false, priority }
      tasks.unshift(t)
      return { ...t }
    }),
    implement(toggleTask, ({ id }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      if (!t) return fail('NotFound', { id })
      t.done = !t.done
      return { ...t }
    }),
    implement(clearDone, () => {
      const before = tasks.length
      const open = tasks.filter((t) => !t.done)
      tasks.splice(0, tasks.length, ...open)
      return { removed: before - tasks.length }
    }),
  ])
}
