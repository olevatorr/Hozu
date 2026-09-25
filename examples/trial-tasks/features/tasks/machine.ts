import { invoke, machine, on, op } from '@tenon/core'
import { addTask, clearDone, toggleTask } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { Context } from './schemas.ts'

export const DUPLICATE = 'A task with this title already exists'
export const INVALID = 'Titles must be 3 to 80 characters'

export const tasksMachine = machine({
  context: Context,
  initialContext: { show: 'all', draft: '', priority: 'normal', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetShow, { target: 'idle', assign: (e) => [op.set(ctx.show, e.show)] }),
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(Add, {
          target: 'adding',
          assign: (e) => [
            op.set(ctx.draft, e.title),
            op.set(ctx.priority, e.priority),
            op.set(ctx.error, null),
          ],
        }),
        on(Toggle, { target: 'toggling', assign: (e) => [op.set(ctx.target, e.id)] }),
        on(ClearDone, { target: 'clearing', assign: () => [op.set(ctx.error, null)] }),
      ],
    },
    adding: {
      ignore: [SetShow, Draft, Add, Toggle, ClearDone],
      invoke: invoke(addTask, {
        input: { title: ctx.draft, priority: ctx.priority },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, ''), op.set(ctx.priority, 'normal')] }],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Invalid: [{ target: 'idle', assign: () => [op.set(ctx.error, INVALID)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    toggling: {
      ignore: [SetShow, Draft, Add, Toggle, ClearDone],
      invoke: invoke(toggleTask, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle' }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    clearing: {
      ignore: [SetShow, Draft, Add, Toggle, ClearDone],
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
