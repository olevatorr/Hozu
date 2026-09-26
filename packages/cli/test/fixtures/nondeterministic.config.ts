import { contract, event, feature, machine, on, op, project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'

const Roll = event({ payload: z.object({ n: z.number() }) })

const dice = machine({
  context: z.object({ last: z.number() }),
  initialContext: { last: 0 },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Roll, {
          target: 'idle',
          guard: (e) => op.gte(e.n, Math.random()),
          assign: (e) => [op.set(ctx.last, e.n)],
        }),
      ],
    },
  }),
})

const rolls = contract(dice, {
  given: { state: 'idle', context: { last: 0 } },
  when: [{ send: Roll, payload: { n: 1 } }],
  expect: { state: 'idle', changes: { last: 1 } },
})

export default project({
  schema: zodAdapter,
  routes: {},
  pages: [],
  features: [
    feature({
      id: 'dice',
      intent: { summary: 'Reads Math.random inside a recorder' },
      declarations: { Roll, rolls, dice },
    }),
  ],
})
