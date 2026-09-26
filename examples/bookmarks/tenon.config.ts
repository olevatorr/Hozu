import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { getBookmark, listBookmarks } from './features/bookmarks/effects.ts'
import { bookmarks } from './features/bookmarks/feature.ts'
import { Board, Detail } from './features/bookmarks/views.ts'
import { bookmarkPage, home } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  http: null,
  env: null,
  notFound: null,
  error: null,
  session: null,
  site: {
    url: 'http://localhost:3000',
    name: 'Bookmarks',
    locales: null,
    lang: 'en',
    icon: null,
    themeColor: null,
  },
  routes: { home, bookmarkPage },
  pages: [
    ui.page(home, {
      views: [Board],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Bookmarks',
          description: 'A shared reading list.',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
    ui.page(bookmarkPage, {
      views: [Detail],
      assert: null,
      head: {
        redirects: null,
        query: getBookmark,
        input: (params) => ({ id: params.id }),
        render: (b) => ({
          title: b.title,
          description: b.title,
          type: 'article',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: { query: listBookmarks, input: {}, params: (b) => ({ id: b.id }) },
    }),
  ],
  features: [bookmarks],
})
