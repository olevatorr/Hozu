import { event, machine, on, query } from '@hozu/core'
import { z } from 'zod'

const Intent = z.enum(['solid', 'outline'])
export const Break = event({ payload: z.object({}) })
export const Fix = event({ payload: z.object({}) })
export const getPlayground = query({
  input: z.object({}),
  output: z.object({ source: z.string(), solid: z.string(), outline: z.string(), joint: z.string() }),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const m = machine({
  context: z.object({ broken: z.boolean(), tried: z.boolean(), intent: Intent }),
  initialContext: { broken: false, tried: false, intent: 'solid' },
  initial: 'clean',
  states: ({ ctx }) => ({
    clean: {
      on: [
        on(Break, {
          target: 'broken',
          assign: () => {
            ctx.broken = true
            ctx.tried = true
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
