import { project, ui } from '@tenonkit/core'
import { zodAdapter } from '@tenonkit/schema-zod'
import { listTags, listYears } from './features/feed/effects.ts'
import { feed } from './features/feed/feature.ts'
import { Archive, Feed, TagList } from './features/feed/views.ts'
import { archive, home, tag } from './routes.ts'

const head = (title: string) => ({
  render: () => ({
    title,
    description: 'A paginated feed built with Tenon.',
  }),
})

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Feed', lang: 'en' },
  routes: { home, tag, archive },
  pages: [
    ui.page(home, { views: [Feed], head: head('Feed') }),
    ui.page(tag, {
      views: [TagList],
      head: head('Tagged'),
      entries: { query: listTags, input: {}, params: (t) => ({ path: t.path }) },
    }),
    ui.page(archive, {
      views: [Archive],
      head: head('Archive'),
      entries: { query: listYears, input: {}, params: (y) => ({ year: y.year }) },
    }),
  ],
  features: [feed],
})
