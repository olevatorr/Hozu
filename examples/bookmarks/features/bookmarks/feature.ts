import { feature } from '@tenon/core'
import * as contracts from './contracts.ts'
import {
  addBookmark,
  bookmarksTag,
  getBookmark,
  isEmpty,
  listBookmarks,
  toggleRead,
  visible,
} from './effects.ts'
import { Add, Draft, ToggleRead } from './events.ts'
import { bookmarksMachine } from './machine.ts'
import { Board, Detail } from './views.ts'

export const bookmarks = feature({
  id: 'bookmarks',
  styles: [],
  widgets: {},
  intent: {
    summary:
      'A shared reading list: add bookmarks with a kind, mark them read, filter unread, one page each.',
    invariants: ['Titles are unique, case-insensitive', 'New bookmarks are listed first'],
  },
  imports: [],
  tags: { bookmarksTag },
  events: { Draft, Add, ToggleRead },
  queries: { listBookmarks, getBookmark },
  mutations: { addBookmark, toggleRead },
  fns: { visible, isEmpty },
  machine: bookmarksMachine,
  views: { Board, Detail },
  contracts: { ...contracts },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
