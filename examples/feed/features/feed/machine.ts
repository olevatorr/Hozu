import { machine, on, op } from '@hozu/core'
import { More } from './events.ts'
import { Context } from './schemas.ts'

export const feedMachine = machine({
  context: Context,
  initialContext: { cursors: [null], last: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(More, {
          target: 'idle',
          guard: (e) => op.and(op.neq(ctx.last, e.cursor), op.neq(e.cursor, null)),
          assign: (e) => [op.append(ctx.cursors, e.cursor), op.set(ctx.last, e.cursor)],
        }),
      ],
    },
  }),
})
