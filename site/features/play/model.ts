import { event, machine, on, query } from '@hozu/core'
import { z } from 'zod'

const Intent = z.enum(['solid', 'outline'])
export const Pick = event({ payload: z.object({ intent: Intent }) })
export const getPlayground = query({
  input: z.object({}),
  output: z.object({ source: z.string(), solid: z.string(), outline: z.string() }),
  scope: 'public',
  freshness: 'static',
})
export const m = machine({
  context: z.object({ intent: Intent }),
  initialContext: { intent: 'solid' },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Pick, {
          target: 'ready',
          assign: (e) => {
            ctx.intent = e.intent
          },
        }),
      ],
    },
  }),
})
