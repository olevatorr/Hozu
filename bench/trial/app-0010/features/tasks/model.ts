import { event, fn, invoke, machine, mutation, on, op, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Priority = z.enum(['low', 'normal', 'high'])
export const Task = z.object({ id: z.string(), title: z.string(), done: z.boolean(), priority: Priority })
export const TaskKey = z.object({ id: z.string() })
export const NewTask = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters').max(80, 'Use at most 80 characters'),
  priority: Priority,
})
export const Show = z.enum(['all', 'open', 'done'])

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string(), priority: Priority }) })
export const ClearDone = event({ payload: z.object({}) })
export const Toggle = event({ payload: TaskKey })
export const SetShow = event({ payload: z.object({ show: Show }) })

export const tasksTag = tag({ param: null })

export const listTasks = query({
  input: z.object({}),
  output: z.array(Task),
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

export const clearDone = mutation({
  input: z.object({}),
  output: z.object({ removed: z.number() }),
  invalidates: () => [tasksTag()],
})

export const toggleTask = mutation({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  invalidates: () => [tasksTag()],
})

const Visible = z.object({ items: z.array(Task), show: Show })

export const visible = fn({
  input: Visible,
  output: z.array(Task),
  impl: ({ items, show }) => items.filter((item) => show === 'all' || (show === 'done') === item.done),
})

export const isEmpty = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ items, show }) => !items.some((item) => show === 'all' || (show === 'done') === item.done),
})

export const DUPLICATE = 'A task with this title already exists'
export const NOT_FOUND = 'This task no longer exists'

export const tasksMachine = machine({
  context: z.object({
    draft: z.string(),
    error: z.string().nullable(),
    fields: z.object({ title: z.string().nullable(), priority: z.string().nullable() }),
    target: z.string(),
    show: Show,
    priority: Priority,
  }),
  initialContext: {
    draft: '',
    error: null,
    fields: { title: null, priority: null },
    target: '',
    show: 'all',
    priority: 'normal',
  },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(Add, {
          target: 'adding',
          assign: (e) => [
            op.set(ctx.draft, e.title),
            op.set(ctx.error, null),
            op.set(ctx.fields, { title: null, priority: null }),
            op.set(ctx.priority, e.priority),
          ],
        }),
        on(Toggle, {
          target: 'toggling',
          assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)],
        }),
        on(SetShow, { target: 'idle', assign: (e) => [op.set(ctx.show, e.show)] }),
        on(ClearDone, { target: 'clearing', assign: () => [op.set(ctx.error, null)] }),
      ],
    },
    adding: {
      ignore: [Draft, Add, Toggle, SetShow, ClearDone],
      invoke: invoke(addTask, {
        input: { title: ctx.draft, priority: ctx.priority },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    toggling: {
      ignore: [Draft, Add, Toggle, SetShow, ClearDone],
      invoke: invoke(toggleTask, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle', assign: () => [op.set(ctx.error, NOT_FOUND)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    clearing: {
      ignore: [Draft, Add, Toggle, SetShow, ClearDone],
      invoke: invoke(clearDone, {
        input: {},
        done: [{ target: 'idle' }],
        failed: { Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }] },
      }),
    },
  }),
})
