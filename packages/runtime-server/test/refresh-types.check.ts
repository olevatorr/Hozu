import { feature, project, query, route } from '@hozu/core'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const Session = z.object({ user: z.string(), expires: z.number() })
const q = query({
  input: z.object({}),
  output: z.string(),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
const home = route({ path: '/', params: null, search: null })
const config = project({
  schema: zodAdapter,
  session: Session,
  routes: { home },
  pages: [],
  features: [feature({ id: 'f', intent: { summary: 'types' }, declarations: [{ q }] })],
})
const r = resolvers(config, (implement) => [implement(q, () => 'x')])
export const typed = app({
  resolvers: r,
  refreshSession: (s) => (s.expires < Date.now() ? { ...s, expires: 1 } : undefined),
})
// @ts-expect-error the session has no field token
export const unknownField = app({ resolvers: r, refreshSession: (s) => s.token })
// @ts-expect-error a refreshed value must be a session
export const notASession = app({ resolvers: r, refreshSession: () => ({ user: 1 }) })
