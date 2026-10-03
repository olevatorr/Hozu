import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const stars = feature({
  id: 'stars',
  intent: {
    summary:
      'Search GitHub and keep your stars, with the token and every call in the browser (a static site)',
    invariants: ['The token never leaves the browser except to GitHub'],
  },
  declarations: [model, views],
  fetch: new URL('./fetch.ts', import.meta.url),
  connect: [{ env: 'GITHUB_API' }],
})
