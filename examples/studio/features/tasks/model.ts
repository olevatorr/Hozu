import { event, fn, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'
import { Show, Status } from '../../routes.ts'

export const Owner = z.enum(['Ada', 'Grace', 'Linus'])
export const Task = z.object({
  id: z.string(),
  title: z.string(),
  status: Status,
  owner: Owner,
  due: z.string(),
})
const Tasks = z.array(Task)
const TaskKey = z.object({ id: z.string() })

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Search = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string(), owner: Owner }) })
export const Move = event({ payload: z.object({ id: z.string(), status: Status }) })
export const AskRemove = event({ payload: z.object({ id: z.string(), title: z.string() }) })
export const ConfirmRemove = event({ payload: z.object({}) })
export const Cancel = event({ payload: z.object({}) })
export const Dismiss = event({ payload: z.object({}) })

export const tasksTag = tag({ param: null })

export const listTasks = query({
  input: z.object({}),
  output: Tasks,
  scope: 'public',
  freshness: 'request',
  tags: () => [tasksTag()],
  runs: 'server',
})

export const summary = query({
  input: z.object({}),
  output: z.object({ todo: z.number(), doing: z.number(), done: z.number() }),
  scope: 'public',
  freshness: 'request',
  tags: () => [tasksTag()],
  runs: 'server',
})

export const getTask = query({
  input: TaskKey,
  output: Task,
  errors: { NotFound: TaskKey },
  scope: 'public',
  freshness: 'request',
  tags: () => [tasksTag()],
  runs: 'server',
})

export const addTask = mutation({
  input: z.object({ title: z.string().min(3, 'Use at least 3 characters').max(60), owner: Owner }),
  output: Task,
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [tasksTag()],
  runs: 'server',
})

export const moveTask = mutation({
  input: z.object({ id: z.string(), status: Status }),
  output: Task,
  errors: { NotFound: TaskKey },
  invalidates: () => [tasksTag()],
  runs: 'server',
})

export const removeTask = mutation({
  input: TaskKey,
  output: TaskKey,
  errors: { NotFound: TaskKey },
  invalidates: () => [tasksTag()],
  runs: 'server',
})

const Filter = z.object({ items: Tasks, show: Show, q: z.string() })

export const visible = fn({
  input: Filter,
  output: Tasks,
  impl: ({ items, show, q }) =>
    items.filter(
      (t) => (show === 'all' || t.status === show) && t.title.toLowerCase().includes(q.trim().toLowerCase()),
    ),
})

export const noMatch = fn({
  input: Filter,
  output: z.boolean(),
  impl: ({ items, show, q }) =>
    !items.some(
      (t) => (show === 'all' || t.status === show) && t.title.toLowerCase().includes(q.trim().toLowerCase()),
    ),
})

export const nextStatus = fn({
  input: Status,
  output: Status,
  impl: (s) => (s === 'todo' ? 'doing' : s === 'doing' ? 'done' : 'todo'),
})

export const tasksMachine = machine({
  context: z.object({
    draft: z.string(),
    owner: Owner,
    q: z.string(),
    error: z.string().nullable(),
    fields: z.object({ title: z.string().nullable(), owner: z.string().nullable() }),
    target: z.string(),
    targetTitle: z.string(),
    status: Status,
    notice: z.string(),
  }),
  initialContext: {
    draft: '',
    owner: 'Ada',
    q: '',
    error: null,
    fields: { title: null, owner: null },
    target: '',
    targetTitle: '',
    status: 'todo',
    notice: '',
  },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Draft, {
      assign: (e) => {
        ctx.draft = e.text
      },
    }),
    on(Search, {
      assign: (e) => {
        ctx.q = e.text
      },
    }),
    on(Add, {
      target: 'adding',
      assign: (e) => {
        ctx.draft = e.title
        ctx.owner = e.owner
        ctx.error = null
        ctx.fields = { title: null, owner: null }
      },
    }),
    on(Move, {
      target: 'moving',
      assign: (e) => {
        ctx.target = e.id
        ctx.status = e.status
      },
    }),
    on(AskRemove, {
      target: 'confirming',
      assign: (e) => {
        ctx.target = e.id
        ctx.targetTitle = e.title
      },
    }),
  ],
  states: ({ ctx }) => ({
    idle: {},
    adding: {
      invoke: invoke(addTask, {
        input: { title: ctx.draft, owner: ctx.owner },
        done: {
          target: 'saved',
          assign: () => {
            ctx.draft = ''
            ctx.notice = 'Task added'
          },
        },
        failed: {
          Duplicate: {
            target: 'idle',
            assign: () => {
              ctx.error = 'A task with this title already exists'
            },
          },
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.fields = e.fields
            },
          },
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    moving: {
      invoke: invoke(moveTask, {
        input: { id: ctx.target, status: ctx.status },
        done: 'idle',
        failed: {
          NotFound: 'idle',
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    confirming: {
      on: [on(Cancel, { target: 'idle' }), on(ConfirmRemove, { target: 'removing' })],
    },
    removing: {
      invoke: invoke(removeTask, {
        input: { id: ctx.target },
        done: {
          target: 'saved',
          assign: () => {
            ctx.notice = 'Task removed'
          },
        },
        failed: {
          NotFound: 'idle',
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    saved: {
      on: [on(Dismiss, { target: 'idle' })],
      after: [{ ms: 3000, target: 'idle' }],
    },
  }),
})
