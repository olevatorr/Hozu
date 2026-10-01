import { event, machine, on } from '@hozu/core'
import { z } from 'zod'

export const Break = event({ payload: z.object({}) })
export const Fix = event({ payload: z.object({}) })
export const m = machine({
  context: z.object({ broken: z.boolean() }),
  initialContext: { broken: false },
  initial: 'clean',
  states: ({ ctx }) => ({
    clean: {
      on: [
        on(Break, {
          target: 'broken',
          assign: () => {
            ctx.broken = true
          },
        }),
      ],
    },
    broken: {
      on: [
        on(Fix, {
          target: 'clean',
          assign: () => {
            ctx.broken = false
          },
        }),
      ],
    },
  }),
})
