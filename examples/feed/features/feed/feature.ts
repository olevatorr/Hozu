import { feature } from '@tenon/core'
import * as contracts from './contracts.ts'
import { byTag, byYear, itemsTag, listPage, listTags, listYears } from './effects.ts'
import { More } from './events.ts'
import { feedMachine } from './machine.ts'
import { Archive, Feed, TagList } from './views.ts'

export const feed = feature({
  id: 'feed',
  styles: [],
  messages: null,
  widgets: {},
  intent: {
    summary:
      'A paginated feed: load more by cursor, infinite scroll, nested tag routes and an optional year segment.',
    invariants: ['Every page is its own cached query', 'A cursor is loaded once'],
  },
  imports: [],
  tags: { itemsTag },
  events: { More },
  queries: { listPage, byTag, byYear, listTags, listYears },
  mutations: {},
  fns: {},
  machine: feedMachine,
  views: { Feed, TagList, Archive },
  contracts: { ...contracts },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
