import { feature, project, query, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

export const now = query({
  input: z.object({}),
  output: z.string(),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const home = route({ path: '/', params: null, search: null })
const Home = ui.view({
  render: () =>
    ui.query(now, {}, { ready: (t) => ui.p({}, [t]), failed: { Unexpected: () => ui.p({}, ['down']) } }),
})

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Edge node' }) } })],
  features: [
    feature({
      id: 'db',
      intent: { summary: 'a resolver over a TCP driver (ADR 0075 A1)' },
      declarations: [{ now, Home }],
    }),
  ],
})
