import { resolvers } from '@tenon/data'
import { addTask, getTask, listTasks, toggleTask } from './features/tasks/effects.ts'
import project from './tenon.config.ts'

export function createResolvers() {
  const tasks = [
    { id: 't1', title: 'Write the spec', done: true },
    { id: 't2', title: 'Build the app', done: false },
    { id: 't3', title: 'Ship it', done: false },
  ]
  let seq = tasks.length
  return resolvers(project, (implement) => [
    implement(listTasks, () => tasks.map((t) => ({ ...t }))),
    implement(getTask, ({ id }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      return t ? { ...t } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title }, { fail }) => {
      const clean = title.trim()
      if (clean.length < 3 || clean.length > 80)
        return fail('Invalid', { message: 'title: Use 3 to 80 characters', fields: { title: 'Use 3 to 80 characters' } })
      if (tasks.some((t) => t.title.toLowerCase() === clean.toLowerCase())) return fail('Duplicate', { title: clean })
      let id = `t${++seq}`
      while (tasks.some((t) => t.id === id)) id = `t${++seq}`
      const t = { id, title: clean, done: false }
      tasks.unshift(t)
      return { ...t }
    }),
    implement(toggleTask, ({ id }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      if (!t) return fail('NotFound', { id })
      t.done = !t.done
      return { ...t }
    }),
  ])
}
