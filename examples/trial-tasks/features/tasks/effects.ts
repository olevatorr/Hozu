import { fn, mutation, query, tag } from '@tenon/core'
import { z } from 'zod'
import { Cleared, Filter, NewTask, NoInput, Task, TaskKey, Tasks } from './schemas.ts'

export const tasksTag = tag({ param: null })
export const taskTag = tag({ param: z.string() })

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
  tags: (input) => [tasksTag(), taskTag(input.id)],
})

export const addTask = mutation({
  input: NewTask,
  output: Task,
  errors: {
    Duplicate: z.object({ title: z.string() }),
    InvalidTitle: z.object({ min: z.number(), max: z.number() }),
  },
  invalidates: () => [tasksTag()],
})

export const toggleTask = mutation({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  invalidates: (input) => [tasksTag(), taskTag(input.id)],
})

export const clearDone = mutation({
  input: NoInput,
  output: Cleared,
  errors: {},
  invalidates: () => [tasksTag()],
})

const Visible = z.object({ tasks: Tasks, filter: Filter })

export const visibleTasks = fn({
  input: Visible,
  output: Tasks,
  impl: ({ tasks, filter }) => tasks.filter((t) => filter === 'all' || t.done === (filter === 'done')),
})

export const noneVisible = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ tasks, filter }) => !tasks.some((t) => filter === 'all' || t.done === (filter === 'done')),
})
