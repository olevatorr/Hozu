import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'
import { lab } from './features/lab/feature.ts'
import { Lab } from './features/lab/views.ts'
import { home } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  env: {
    files: ['.env', '.env.local'],
    server: z.object({
      USERS_API: z.string().default('https://jsonplaceholder.typicode.com'),
      POSTS_API_INTERNAL: z.string().optional(),
    }),
    public: z.object({ POSTS_API: z.string().default('https://jsonplaceholder.typicode.com') }),
    internal: { POSTS_API: 'POSTS_API_INTERNAL' },
  },
  site: { url: 'http://localhost:3000', name: 'API playground', lang: 'en' },
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Lab],
      head: {
        render: () => ({
          title: 'API playground',
          description: 'One query and mutation of each kind: on the server, on either side, in the browser.',
        }),
      },
    }),
  ],
  features: [lab],
})
