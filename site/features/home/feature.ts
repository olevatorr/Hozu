import { feature } from '@hozu/core'
import { content } from '../content/views.ts'
import * as devtools from './devtools.ts'
import * as model from './model.ts'
import * as views from './views.ts'

export const homePage = feature({
  id: 'home',
  intent: {
    summary:
      'The home page: an AI change Hozu catches, the bill, DevTools, the playground and the evidence; the DevTools page',
  },
  imports: [content],
  declarations: [model, views, devtools],
})
