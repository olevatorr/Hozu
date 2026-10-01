import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const hero = feature({
  id: 'hero',
  intent: { summary: 'The home page demo: an AI change that Hozu catches' },
  declarations: [model, views],
})
