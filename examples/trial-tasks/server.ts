import { resolvers } from '@tenon/data'
import { addTask, clearDone, getTask, listTasks, toggleTask } from './features/tasks/effects.ts'
import type { Task } from './features/tasks/schemas.ts'
import project from './tenon.config.ts'

export function createResolvers() {
  const items: Task[] = [
    { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
    { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
    { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
  ]
  let seq = items.length
  return resolvers(project, (implement) => [
    implement(listTasks, () => items.map((t) => ({ ...t }))),
    implement(getTask, ({ id }, { fail }) => {
      const t = items.find((x) => x.id === id)
      return t ? { ...t } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, priority }, { fail }) => {
      const clean = title.trim()
      if (clean.length < 3 || clean.length > 80) return fail('Invalid', { title: clean })
      if (items.some((t) => t.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const t = { id: `t${++seq}`, title: clean, done: false, priority }
      items.unshift(t)
      return { ...t }
    }),
    implement(toggleTask, ({ id }, { fail }) => {
      const t = items.find((x) => x.id === id)
      if (!t) return fail('NotFound', { id })
      t.done = !t.done
      return { ...t }
    }),
    implement(clearDone, () => {
      const before = items.length
      for (let i = items.length - 1; i >= 0; i--) if (items[i]!.done) items.splice(i, 1)
      return { removed: before - items.length }
    }),
  ])
}
