import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const lab = feature({
  id: 'lab',
  intent: {
    summary:
      'A playground with an effect of each kind: server data and a server-side API call, a public API the browser may call, and storage only the browser has',
  },
  declarations: [model, views],
  fetch: new URL('./fetch.ts', import.meta.url),
  connect: [{ env: 'POSTS_API' }],
})
