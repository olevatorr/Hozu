import { invoke, machine, on, op } from '@tenon/core'
import { addTask, toggleTask } from './effects.ts'
import { Add, Draft, SetShow, Toggle } from './events.ts'
import { Context } from './schemas.ts'

export const DUPLICATE = 'A task with this title already exists'

export const tasksMachine = machine({
  context: Context,
  initialContext: { show: 'all', draft: '', target: '', error: null, fields: { title: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(SetShow, { target: 'idle', assign: (e) => [op.set(ctx.show, e.show)] }),
        on(Add, {
          target: 'adding',
          assign: (e) => [
            op.set(ctx.draft, e.title),
            op.set(ctx.error, null),
            op.set(ctx.fields, { title: null }),
          ],
        }),
        on(Toggle, { target: 'toggling', assign: (e) => [op.set(ctx.target, e.id)] }),
      ],
    },
    adding: {
      ignore: [Draft, SetShow, Add, Toggle],
      invoke: invoke(addTask, {
        input: { title: ctx.draft },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    toggling: {
      ignore: [Draft, SetShow, Add, Toggle],
      invoke: invoke(toggleTask, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle' }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
  }),
})
