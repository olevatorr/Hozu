import { project, ui } from '@tenonkit/core'
import { zodAdapter } from '@tenonkit/schema-zod'
import { site } from './features/site/feature.ts'
import { About, Showcase } from './features/site/views.ts'
import { about, home } from './routes.ts'

const head = (title: string, description: string) => ({
  render: () => ({
    title,
    description,
  }),
})

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: {
    url: 'https://showcase.tenon.dev',
    name: 'Tenon Showcase',
    lang: 'en',
    icon: ui.asset(new URL('./icon.svg', import.meta.url)),
    themeColor: '#4f46e5',
  },
  routes: { home, about },
  pages: [
    ui.page(home, {
      views: [Showcase],
      head: head('Tenon Showcase', 'Every modern presentation capability, verified.'),
    }),
    ui.page(about, {
      views: [About],
      assert: 'static',
      head: head('About — Tenon Showcase', 'How the parity check works.'),
    }),
  ],
  features: [site],
})
