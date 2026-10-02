import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'
import { stars } from './features/stars/feature.ts'
import { Board } from './features/stars/views.ts'
import { home } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  env: {
    server: z.object({}),
    public: z.object({ GITHUB_API: z.string().default('https://api.github.com') }),
  },
  site: { url: 'https://stars.example', name: 'Stars', lang: 'en' },
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Board],
      head: {
        render: () => ({
          title: 'Stars',
          description: 'Search GitHub and keep your stars, from the browser.',
        }),
      },
    }),
  ],
  features: [stars],
})
