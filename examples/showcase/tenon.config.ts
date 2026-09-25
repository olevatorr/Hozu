import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { site } from './features/site/feature.ts'
import { About, Showcase } from './features/site/views.ts'
import { about, home } from './routes.ts'

const head = (title: string, description: string) => ({
  redirects: null,
  query: null,
  input: null,
  render: () => ({
    title,
    description,
    type: 'website' as const,
    image: null,
    published: null,
    noindex: false,
  }),
})

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  http: null,
  notFound: null,
  error: null,
  session: null,
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
      assert: null,
      head: head('Tenon Showcase', 'Every modern presentation capability, verified.'),
      entries: null,
    }),
    ui.page(about, {
      views: [About],
      assert: 'static',
      head: head('About — Tenon Showcase', 'How the parity check works.'),
      entries: null,
    }),
  ],
  features: [site],
})
