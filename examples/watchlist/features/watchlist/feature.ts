import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const watchlist = feature({
  id: 'watchlist',
  intent: {
    summary: 'A personal watchlist kept in this browser, with quotes read from the server',
    invariants: ["Each visitor's list stays in their own browser"],
  },
  declarations: [model, views],
  fetch: new URL('./fetch.ts', import.meta.url),
})
