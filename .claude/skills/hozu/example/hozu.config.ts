import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { bookmarks } from './features/bookmarks/feature.ts'
import { getBookmark, listBookmarks } from './features/bookmarks/model.ts'
import { Board, Detail } from './features/bookmarks/views.ts'
import { bookmarkPage, home } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Bookmarks', lang: 'en' },
  routes: { home, bookmarkPage },
  pages: [
    ui.page(home, {
      views: [Board],
      head: { render: () => ({ title: 'Bookmarks', description: 'A shared reading list.' }) },
    }),
    ui.page(bookmarkPage, {
      views: [Detail],
      head: {
        query: getBookmark,
        input: (params) => ({ id: params.id }),
        render: (b) => ({ title: b.title, description: b.title, type: 'article' }),
      },
      entries: { query: listBookmarks, input: {}, params: (b) => ({ id: b.id }) },
    }),
  ],
  features: [bookmarks],
})
