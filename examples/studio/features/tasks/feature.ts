import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const tasks = feature({
  id: 'tasks',
  intent: {
    summary:
      'A team task board to test Hozu DevTools: counts, filters, search, add, move, remove with a confirmation, a saved notice.',
    invariants: ['Titles are unique, case-insensitive', 'New tasks are listed first'],
  },
  declarations: [model, views],
})
