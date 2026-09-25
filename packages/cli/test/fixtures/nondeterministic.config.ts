import { contract, event, feature, machine, on, op, project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'

const Roll = event({ payload: z.object({ n: z.number() }) })

const dice = machine({
  context: z.object({ last: z.number() }),
  initialContext: { last: 0 },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Roll, { target: 'idle', assign: () => [op.set(ctx.last, Math.random())] })] },
  }),
})

const rolls = contract(dice, {
  given: { state: 'idle', context: { last: 0 } },
  when: [{ send: Roll, payload: { n: 1 } }],
  expect: { state: 'idle', context: null, effects: [] },
})

export default project({
  schema: zodAdapter,
  styles: null,
  notFound: null,
  error: null,
  session: null,
  site: null,
  routes: {},
  pages: [],
  features: [
    feature({
      id: 'dice',
      styles: [],
      widgets: {},
      intent: { summary: 'Reads Math.random inside a recorder', invariants: [] },
      imports: [],
      tags: {},
      events: { Roll },
      queries: {},
      mutations: {},
      fns: {},
      machine: dice,
      views: {},
      contracts: { rolls },
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})
