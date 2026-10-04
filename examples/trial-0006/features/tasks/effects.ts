import { fn, mutation, query, tag } from '@hozu/core'
import { z } from 'zod'
import { Cleared, NewTask, NoInput, Show, Task, TaskKey, Tasks } from './schemas.ts'

export const tasksTag = tag({ param: null })

export const listTasks = query({
  input: NoInput,
  output: Tasks,
  scope: 'public',
  freshness: 'static',
  tags: () => [tasksTag()],
  runs: 'server',
})

export const getTask = query({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  scope: 'public',
  freshness: 'static',
  tags: () => [tasksTag()],
  runs: 'server',
})

export const addTask = mutation({
  input: NewTask,
  output: Task,
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [tasksTag()],
  runs: 'server',
  access: 'anyone',
})

export const toggleTask = mutation({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  invalidates: () => [tasksTag()],
  runs: 'server',
  access: 'anyone',
})

export const clearDone = mutation({
  input: NoInput,
  output: Cleared,
  invalidates: () => [tasksTag()],
  runs: 'server',
  access: 'anyone',
})

const Visible = z.object({ items: Tasks, show: Show })

export const visible = fn({
  input: Visible,
  output: Tasks,
  impl: ({ items, show }) => items.filter((t) => show === 'all' || (show === 'done') === t.done),
})

export const isEmpty = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ items, show }) => !items.some((t) => show === 'all' || (show === 'done') === t.done),
})
