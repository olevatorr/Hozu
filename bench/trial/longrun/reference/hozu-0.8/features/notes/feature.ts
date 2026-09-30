import { feature } from '@hozu/core'
import { account } from '../account/feature.ts'
import * as model from './model.ts'
import * as views from './views.ts'

export const notes = feature({
  id: 'notes',
  intent: {
    summary: 'Personal notes per signed-in user: add, delete, pin, search in the browser',
    invariants: ['A user sees only their own notes', 'Note titles are unique per user, case-insensitive'],
  },
  imports: [account],
  declarations: [model, views],
})
