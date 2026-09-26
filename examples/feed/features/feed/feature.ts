import { feature } from '@tenonkit/core'
import * as contracts from './contracts.ts'
import { byTag, byYear, itemsTag, listPage, listTags, listYears } from './effects.ts'
import { More } from './events.ts'
import { feedMachine } from './machine.ts'
import { Archive, Feed, TagList } from './views.ts'

export const feed = feature({
  id: 'feed',
  intent: {
    summary:
      'A paginated feed: load more by cursor, infinite scroll, nested tag routes and an optional year segment.',
    invariants: ['Every page is its own cached query', 'A cursor is loaded once'],
  },
  declarations: {
    itemsTag,
    More,
    listPage,
    byTag,
    byYear,
    listTags,
    listYears,
    Feed,
    TagList,
    Archive,
    ...contracts,
    feedMachine,
  },
})
