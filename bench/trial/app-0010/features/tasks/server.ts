import type { Implement } from '@hozu/data'
import { addTask, clearDone, getTask, listTasks, toggleTask } from './model.ts'

export function tasksResolvers<Session, Env>(implement: Implement<Session, Env>) {
  const items: { id: string; title: string; done: boolean; priority: 'low' | 'normal' | 'high' }[] = [
    { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
    { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
    { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
  ]
  let seq = items.length
  const find = (id: string) => items.find((item) => item.id === id)
  return [
    implement(listTasks, () => items.map((item) => ({ ...item }))),
    implement(getTask, ({ id }, { fail }) => {
      const item = find(id)
      return item ? { ...item } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, priority }, { fail }) => {
      const clean = title.trim()
      if (items.some((item) => item.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      let id = `t${++seq}`
      while (find(id)) id = `t${++seq}`
      const item = { id, title: clean, done: false, priority }
      items.unshift(item)
      return { ...item }
    }),
    implement(clearDone, () => {
      const before = items.length
      items.splice(0, items.length, ...items.filter((item) => !item.done))
      return { removed: before - items.length }
    }),
    implement(toggleTask, ({ id }, { fail }) => {
      const item = find(id)
      if (!item) return fail('NotFound', { id })
      item.done = !item.done
      return { ...item }
    }),
  ]
}
