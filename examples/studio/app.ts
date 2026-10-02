import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { addTask, getTask, listTasks, moveTask, removeTask, summary } from './features/tasks/model.ts'
import project from './hozu.config.ts'

type Status = 'todo' | 'doing' | 'done'
type Owner = 'Ada' | 'Grace' | 'Linus'

const tasks: { id: string; title: string; status: Status; owner: Owner; due: string }[] = [
  { id: 't1', title: 'Write the release notes', status: 'doing', owner: 'Ada', due: 'Oct 4' },
  { id: 't2', title: 'Fix the sign-in redirect', status: 'todo', owner: 'Linus', due: 'Oct 6' },
  { id: 't3', title: 'Design the empty states', status: 'todo', owner: 'Grace', due: 'Oct 7' },
  { id: 't4', title: 'Ship the pricing page', status: 'done', owner: 'Ada', due: 'Sep 30' },
  { id: 't5', title: 'Review the onboarding flow', status: 'doing', owner: 'Grace', due: 'Oct 5' },
]
let seq = tasks.length

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(listTasks, () => tasks.map((t) => ({ ...t }))),
    implement(summary, () => ({
      todo: tasks.filter((t) => t.status === 'todo').length,
      doing: tasks.filter((t) => t.status === 'doing').length,
      done: tasks.filter((t) => t.status === 'done').length,
    })),
    implement(getTask, ({ id }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      return t ? { ...t } : fail('NotFound', { id })
    }),
    implement(addTask, ({ title, owner }, { fail }) => {
      const clean = title.trim()
      if (tasks.some((t) => t.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const t = { id: `t${++seq}`, title: clean, status: 'todo' as Status, owner, due: 'Oct 10' }
      tasks.unshift(t)
      return { ...t }
    }),
    implement(moveTask, ({ id, status }, { fail }) => {
      const t = tasks.find((x) => x.id === id)
      if (!t) return fail('NotFound', { id })
      t.status = status
      return { ...t }
    }),
    implement(removeTask, ({ id }, { fail }) => {
      const at = tasks.findIndex((x) => x.id === id)
      if (at < 0) return fail('NotFound', { id })
      tasks.splice(at, 1)
      return { id }
    }),
  ]),
})
