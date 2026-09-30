import { event, fn, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Show = z.enum(['all', 'open', 'done'])
export const Priority = z.enum(['low', 'normal', 'high'])
export const Task = z.object({ id: z.string(), title: z.string(), done: z.boolean(), priority: Priority })
const Tasks = z.array(Task)
const TaskKey = z.object({ id: z.string() })

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string(), priority: Priority }) })
export const ClearDone = event({ payload: z.object({}) })
export const Toggle = event({ payload: TaskKey })
export const SetShow = event({ payload: z.object({ show: Show }) })

export const tasksTag = tag({ param: null })

export const listTasks = query({
  input: z.object({}),
  output: Tasks,
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
  input: z.object({
    title: z.string().trim().min(3, 'Use at least 3 characters').max(80, 'Use at most 80 characters'),
    priority: Priority,
  }),
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

export const clearDone = mutation({
  input: z.object({}),
  output: z.object({ removed: z.number() }),
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

export const DUPLICATE = 'A task with this title already exists'

export const tasksMachine = machine({
  context: z.object({
    draft: z.string(),
    show: Show,
    priority: Priority,
    target: z.string(),
    error: z.string().nullable(),
  }),
  initialContext: { draft: '', show: 'all', priority: 'normal', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, {
          target: 'idle',
          assign: (e) => {
            ctx.draft = e.text
          },
        }),
        on(SetShow, {
          target: 'idle',
          assign: (e) => {
            ctx.show = e.show
          },
        }),
        on(Add, {
          target: 'adding',
          assign: (e) => {
            ctx.draft = e.title
            ctx.priority = e.priority
            ctx.error = null
          },
        }),
        on(ClearDone, {
          target: 'clearing',
          assign: () => {
            ctx.error = null
          },
        }),
        on(Toggle, {
          target: 'toggling',
          assign: (e) => {
            ctx.target = e.id
          },
        }),
      ],
    },
    adding: {
      invoke: invoke(addTask, {
        input: { title: ctx.draft, priority: ctx.priority },
        done: [
          {
            target: 'idle',
            assign: () => {
              ctx.draft = ''
            },
          },
        ],
        failed: {
          Duplicate: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = DUPLICATE
              },
            },
          ],
          Invalid: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    toggling: {
      invoke: invoke(toggleTask, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle' }],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    clearing: {
      invoke: invoke(clearDone, {
        input: {},
        done: [{ target: 'idle' }],
        failed: {
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
  }),
})
