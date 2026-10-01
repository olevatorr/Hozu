import { feature } from '@hozu/core'
import { content } from '../content/views.ts'
import * as model from './model.ts'
import * as views from './views.ts'

export const homePage = feature({
  id: 'home',
  intent: { summary: 'The home page: an AI change Hozu catches, the bill, the playground and the evidence' },
  imports: [content],
  declarations: [model, views],
})
