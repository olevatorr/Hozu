import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { stations } from './features/stations/feature.ts'
import { Explorer } from './features/stations/views.ts'
import { home } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'City bikes', lang: 'en' },
  routes: { home },
  pages: [ui.page(home, { views: [Explorer], head: { render: () => ({ title: 'City bikes' }) } })],
  features: [stations],
})
