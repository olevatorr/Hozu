import { invoke, machine, on, op } from '@tenon/core'
import { addTask, clearDone, toggleTask } from './effects.ts'
import { AddTask, ClearDone, Draft, SetFilter, SetPriority, ToggleTask } from './events.ts'
import { Context } from './schemas.ts'

export const DUPLICATE = 'A task with this title already exists'
export const INVALID = 'Titles must be 3–80 characters'

export const tasksMachine = machine({
  context: Context,
  initialContext: { filter: 'all', draft: '', title: '', priority: 'normal', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetFilter, { target: 'idle', assign: (e) => [op.set(ctx.filter, e.filter)] }),
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(SetPriority, {
          target: 'idle',
          guard: (e) => op.eq(e.priority, 'low'),
          assign: () => [op.set(ctx.priority, 'low')],
        }),
        on(SetPriority, {
          target: 'idle',
          guard: (e) => op.eq(e.priority, 'high'),
          assign: () => [op.set(ctx.priority, 'high')],
        }),
        on(SetPriority, { target: 'idle', assign: () => [op.set(ctx.priority, 'normal')] }),
        on(AddTask, {
          target: 'adding',
          assign: (e) => [op.set(ctx.title, e.title), op.set(ctx.error, null)],
        }),
        on(ToggleTask, {
          target: 'toggling',
          assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)],
        }),
        on(ClearDone, { target: 'clearing', assign: () => [op.set(ctx.error, null)] }),
      ],
    },
    adding: {
      invoke: invoke(addTask, {
        input: { title: ctx.title, priority: ctx.priority },
        done: [
          {
            target: 'idle',
            assign: () => [op.set(ctx.draft, ''), op.set(ctx.title, ''), op.set(ctx.priority, 'normal')],
          },
        ],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          InvalidTitle: [{ target: 'idle', assign: () => [op.set(ctx.error, INVALID)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    toggling: {
      invoke: invoke(toggleTask, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle', assign: () => [op.set(ctx.error, 'Task not found')] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    clearing: {
      invoke: invoke(clearDone, {
        input: {},
        done: [{ target: 'idle' }],
        failed: {
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
  }),
})
