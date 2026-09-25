import { invoke, machine, on, op } from '@tenon/core'
import { addBookmark, toggleRead } from './effects.ts'
import { Add, Draft, PickKind, SetShow, ToggleRead } from './events.ts'
import { Context } from './schemas.ts'

export const DUPLICATE = 'This bookmark already exists'

export const bookmarksMachine = machine({
  context: Context,
  initialContext: { show: 'all', draft: '', kind: 'article', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetShow, { target: 'idle', assign: (e) => [op.set(ctx.show, e.show)] }),
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(PickKind, { target: 'idle', assign: (e) => [op.set(ctx.kind, e.kind)] }),
        on(Add, { target: 'adding', assign: (e) => [op.set(ctx.draft, e.title), op.set(ctx.error, null)] }),
        on(ToggleRead, { target: 'toggling', assign: (e) => [op.set(ctx.target, e.id)] }),
      ],
    },
    adding: {
      ignore: [SetShow, Draft, PickKind, Add, ToggleRead],
      invoke: invoke(addBookmark, {
        input: { title: ctx.draft, kind: ctx.kind },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    toggling: {
      ignore: [SetShow, Draft, PickKind, Add, ToggleRead],
      invoke: invoke(toggleRead, {
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
