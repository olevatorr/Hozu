import { endpoint, feature, project, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

export const who = endpoint({
  method: 'GET',
  path: '/api/who',
  input: z.object({ room: z.string() }),
  output: z.object({ room: z.string(), token: z.string() }),
  errors: { NoToken: z.object({ message: z.string() }) },
  failed: { NoToken: 401 },
})
export const book = endpoint({
  method: 'POST',
  path: '/api/book',
  input: z.object({ room: z.string() }),
  output: z.object({ booked: z.string() }),
})
const home = route({ path: '/', params: null, search: null })
const Home = ui.view({ render: () => ui.p({}, ['endpoints']) })

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Endpoints' }) } })],
  features: [
    feature({
      id: 'api',
      intent: { summary: 'hozu call endpoints (ADR 0056 C)' },
      declarations: [{ who, book, Home }],
    }),
  ],
})
