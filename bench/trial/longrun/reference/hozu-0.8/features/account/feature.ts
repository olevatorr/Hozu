import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const account = feature({
  id: 'account',
  intent: { summary: 'Sign in with a name, sign out; the session identifies the user' },
  exports: [model.me],
  declarations: [model, views],
})
