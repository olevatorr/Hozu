import { fn, mutation, query, tag } from '@tenon/core'
import { z } from 'zod'
import { NewTask, NoInput, Show, Task, TaskKey, Tasks } from './schemas.ts'

export const tasksTag = tag({ param: null })

export const listTasks = query({
  input: NoInput,
  output: Tasks,
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [tasksTag()],
})

export const getTask = query({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  scope: 'public',
  freshness: 'static',
  tags: () => [tasksTag()],
})

export const addTask = mutation({
  input: NewTask,
  output: Task,
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [tasksTag()],
})

export const toggleTask = mutation({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  invalidates: () => [tasksTag()],
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
