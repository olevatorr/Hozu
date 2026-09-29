import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const bookmarks = feature({
  id: 'bookmarks',
  intent: {
    summary:
      'A shared reading list: add bookmarks with a kind, mark them read, filter unread, one page each.',
    invariants: ['Titles are unique, case-insensitive', 'New bookmarks are listed first'],
  },
  declarations: [model, views],
})
