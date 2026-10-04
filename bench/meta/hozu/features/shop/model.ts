import { event, machine, on, query } from '@hozu/core'
import { z } from 'zod'

const Product = z.object({ sku: z.string(), name: z.string(), price: z.number() })

export const listProducts = query({
  input: z.object({}),
  output: z.array(Product),
  scope: 'public',
  freshness: 'request',
  tags: () => [],
  runs: 'server',
})

export const Add = event({ payload: z.object({ sku: z.string() }) })

export const cart = machine({
  context: z.object({ count: z.number() }),
  initialContext: { count: 0 },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Add, {
          target: 'ready',
          assign: () => {
            ctx.count += 1
          },
        }),
      ],
    },
  }),
})
