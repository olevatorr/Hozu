import { machine, on } from '@hozu/core'
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
          guard: (e) => ctx.last !== e.cursor && e.cursor !== null,
          assign: (e) => {
            ctx.cursors.push(e.cursor)
            ctx.last = e.cursor
          },
        }),
      ],
    },
  }),
})
