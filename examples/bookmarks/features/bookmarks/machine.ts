import { invoke, machine, on, op, ui } from '@tenon/core'
import { bookmarkPage } from '../../routes.ts'
import { addBookmark, toggleRead } from './effects.ts'
import { Add, Draft, ToggleRead } from './events.ts'
import { Context } from './schemas.ts'

export const DUPLICATE = 'This bookmark already exists'

export const bookmarksMachine = machine({
  context: Context,
  initialContext: { draft: '', kind: 'article', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(Add, {
          target: 'adding',
          assign: (e) => [op.set(ctx.draft, e.title), op.set(ctx.kind, e.kind), op.set(ctx.error, null)],
        }),
        on(ToggleRead, { target: 'toggling', assign: (e) => [op.set(ctx.target, e.id)] }),
      ],
    },
    adding: {
      ignore: [Draft, Add, ToggleRead],
      invoke: invoke(addBookmark, {
        input: { title: ctx.draft, kind: ctx.kind },
        done: [
          {
            target: 'idle',
            assign: () => [op.set(ctx.draft, '')],
            navigate: (b) => ui.link(bookmarkPage, { id: b.id }),
          },
        ],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    toggling: {
      ignore: [Draft, Add, ToggleRead],
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
