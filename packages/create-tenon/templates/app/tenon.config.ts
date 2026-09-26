import { project, ui } from '@tenonkit/core'
import { zodAdapter } from '@tenonkit/schema-zod'
import { Home, site } from './features/site/views.ts'
import { home } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: '__NAME__', lang: 'en' },
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: '__NAME__' }) } })],
  features: [site],
})
