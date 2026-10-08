import { mutation, project, query } from '@hozu/core'
import { resolvers } from '@hozu/data'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const p = project({
  schema: zodAdapter,
  session: z.object({ userId: z.string() }),
  routes: {},
  pages: [],
  features: [],
})
const pub = query({
  input: z.object({}),
  output: z.string(),
  errors: { Gone: z.object({}) },
  scope: 'public',
  freshness: 'static',
  tags: () => [],
  runs: 'server',
})
const mine = query({
  input: z.object({}),
  output: z.string(),
  scope: 'user',
  freshness: 'live',
  tags: () => [],
  runs: 'server',
  access: 'anyone',
})

const signed = query({
  input: z.object({}),
  output: z.string(),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})
const save = mutation({ input: z.object({}), output: z.string(), runs: 'server', access: 'signedIn' })
const open = mutation({ input: z.object({}), output: z.string(), runs: 'server', access: 'anyone' })
const staff = mutation({
  input: z.object({}),
  output: z.string(),
  runs: 'server',
  access: { allow: ({ session }) => session.userId !== '' },
})

resolvers(p, (implement) => [
  implement(signed, (_, { session }) => session.userId),
  implement(save, (_, { session }) => session.userId),
  implement(staff, (_, { session }) => session.userId),
  // @ts-expect-error access 'anyone' does not promise a session
  implement(open, (_, { session }) => session.userId),
  implement(signed, (_, { fail }) => fail('Forbidden', { message: 'Staff only' })),
  // @ts-expect-error a public query cannot answer Forbidden
  implement(pub, (_, { fail }) => fail('Forbidden', {})),
])

resolvers(p, (implement) => [
  implement(mine, (_, { session }) => session?.userId ?? ''),
  // @ts-expect-error public resolvers never see the session
  implement(pub, (_, { session }) => String(session)),
  // @ts-expect-error undeclared error name
  implement(pub, (_, { fail }) => fail('Missing', {})),
  // @ts-expect-error wrong output type
  implement(pub, () => 42),
])

const order = mutation({
  input: z.object({ amount: z.coerce.number(), tags: z.array(z.string()).default([]) }),
  output: z.number(),
  runs: 'server',
  access: 'anyone',
})

resolvers(p, (implement) => [
  implement(order, ({ amount, tags }) => amount + tags.length),
  // @ts-expect-error the resolver receives the parsed input, so amount is a number
  implement(order, ({ amount }) => amount.length),
])
