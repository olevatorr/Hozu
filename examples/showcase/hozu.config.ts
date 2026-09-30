import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
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
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  site: {
    url: 'https://showcase.hozu.dev',
    name: 'Hozu Showcase',
    lang: 'en',
    icon: ui.asset(new URL('./icon.svg', import.meta.url)),
    themeColor: '#4f46e5',
  },
  routes: { home, about },
  pages: [
    ui.page(home, {
      views: [Showcase],
      head: head('Hozu Showcase', 'Every modern presentation capability, verified.'),
    }),
    ui.page(about, {
      views: [About],
      assert: 'static',
      head: head('About — Hozu Showcase', 'How the parity check works.'),
    }),
  ],
  features: [site],
})
