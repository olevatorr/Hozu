import { event, feature, machine, on, op, project } from '@tenon/core'
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

export default project({
  schema: zodAdapter,
  routes: {},
  features: [
    feature({
      id: 'dice',
      intent: { summary: 'Reads Math.random inside a recorder', invariants: [] },
      imports: [],
      tags: {},
      events: { Roll },
      queries: {},
      mutations: {},
      fns: {},
      machine: dice,
      views: {},
      contracts: {},
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})
