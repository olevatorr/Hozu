import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { watchlist } from './features/watchlist/feature.ts'
import { Board } from './features/watchlist/views.ts'
import { home } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'https://watchlist.example', name: 'Watchlist', lang: 'en' },
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Board],
      head: { render: () => ({ title: 'Watchlist', description: 'Your symbols, kept in this browser.' }) },
    }),
  ],
  features: [watchlist],
  accept: [
    { code: 'HZ036', at: 'watchlist.Add', reason: 'the list is kept in this browser, so adding needs JavaScript' },
  ],
})
