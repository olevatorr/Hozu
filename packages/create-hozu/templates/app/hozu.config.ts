import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { site } from './features/site/feature.ts'
import { Home } from './features/site/views.ts'
import { home } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  app: new URL('./app.ts', import.meta.url),
  site: { url: 'http://localhost:3000', name: '__NAME__', lang: 'en' },
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: '__NAME__' }) } })],
  features: [site],
})
