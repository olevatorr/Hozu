import { project, query } from '@tenon/core'
import { resolvers } from '@tenon/data'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'

const p = project({
  schema: zodAdapter,
  styles: null,
  notFound: null,
  session: z.object({ userId: z.string() }),
  site: null,
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
})
const mine = query({
  input: z.object({}),
  output: z.string(),
  errors: {},
  scope: 'user',
  freshness: 'live',
  tags: () => [],
})

resolvers(p, (implement) => [
  implement(mine, (_, { session }) => session?.userId ?? ''),
  // @ts-expect-error public resolvers never see the session
  implement(pub, (_, { session }) => String(session)),
  // @ts-expect-error undeclared error name
  implement(pub, (_, { fail }) => fail('Missing', {})),
  // @ts-expect-error wrong output type
  implement(pub, () => 42),
])
