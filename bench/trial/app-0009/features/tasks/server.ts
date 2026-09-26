import type { Implement } from '@hozu/data'
import type { z } from 'zod'
import { addTask, clearDone, getTask, listTasks, type Task, toggleTask } from './model.ts'

export function tasksResolvers<Session, Env>(implement: Implement<Session, Env>) {
  const items: z.infer<typeof Task>[] = [
    { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
    { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
    { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
  ]
  let seq = items.length
  return [
    implement(listTasks, () => items.map((item) => ({ ...item }))),
    implement(getTask, ({ id }, { fail }) => {
      const item = items.find((x) => x.id === id)
      return item ? { ...item } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, priority }, { fail }) => {
      const clean = title.trim()
      if (clean.length < 3 || clean.length > 80)
        return fail('Invalid', {
          message: 'title: Use 3 to 80 characters',
          fields: { title: 'Use 3 to 80 characters' },
        })
      if (items.some((item) => item.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      let id = `t${++seq}`
      while (items.some((x) => x.id === id)) id = `t${++seq}`
      const item = { id, title: clean, done: false, priority }
      items.unshift(item)
      return { ...item }
    }),
    implement(toggleTask, ({ id }, { fail }) => {
      const item = items.find((x) => x.id === id)
      if (!item) return fail('NotFound', { id })
      item.done = !item.done
      return { ...item }
    }),
    implement(clearDone, () => {
      const before = items.length
      for (let i = items.length - 1; i >= 0; i--) if (items[i]?.done) items.splice(i, 1)
      return { removed: before - items.length }
    }),
  ]
}
