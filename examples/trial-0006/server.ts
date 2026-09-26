import { resolvers } from '@tenonkit/data'
import { addTask, clearDone, getTask, listTasks, toggleTask } from './features/tasks/effects.ts'
import project from './tenon.config.ts'

export function createResolvers() {
  const tasks = [
    { id: 't1', title: 'Write the spec', done: true, priority: 'normal' as 'low' | 'normal' | 'high' },
    { id: 't2', title: 'Build the app', done: false, priority: 'normal' as 'low' | 'normal' | 'high' },
    { id: 't3', title: 'Ship it', done: false, priority: 'normal' as 'low' | 'normal' | 'high' },
  ]
  let seq = tasks.length
  return resolvers(project, (implement) => [
    implement(listTasks, () => tasks.map((t) => ({ ...t }))),
    implement(getTask, ({ id }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      return t ? { ...t } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, priority }, { fail }) => {
      const clean = title.trim()
      if (clean.length < 3 || clean.length > 80)
        return fail('Invalid', {
          message: 'title: Use 3 to 80 characters',
          fields: { title: 'Use 3 to 80 characters', priority: null },
        })
      if (tasks.some((t) => t.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      let id = `t${++seq}`
      while (tasks.some((t) => t.id === id)) id = `t${++seq}`
      const t = { id, title: clean, done: false, priority }
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
      for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i]?.done) tasks.splice(i, 1)
      return { removed: before - tasks.length }
    }),
  ])
}
