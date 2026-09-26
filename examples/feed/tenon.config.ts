import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { listTags, listYears } from './features/feed/effects.ts'
import { feed } from './features/feed/feature.ts'
import { Archive, Feed, TagList } from './features/feed/views.ts'
import { archive, home, tag } from './routes.ts'

const head = (title: string) => ({
  redirects: null,
  query: null,
  input: null,
  render: () => ({
    title,
    description: 'A paginated feed built with Tenon.',
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
    url: 'http://localhost:3000',
    name: 'Feed',
    lang: 'en',
    locales: null,
    icon: null,
    themeColor: null,
  },
  routes: { home, tag, archive },
  pages: [
    ui.page(home, { views: [Feed], assert: null, head: head('Feed'), entries: null }),
    ui.page(tag, {
      views: [TagList],
      assert: null,
      head: head('Tagged'),
      entries: { query: listTags, input: {}, params: (t) => ({ path: t.path }) },
    }),
    ui.page(archive, {
      views: [Archive],
      assert: null,
      head: head('Archive'),
      entries: { query: listYears, input: {}, params: (y) => ({ year: y.year }) },
    }),
  ],
  features: [feed],
})
