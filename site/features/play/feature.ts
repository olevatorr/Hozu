import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const play = feature({
  id: 'play',
  intent: { summary: 'The home page component playground' },
  declarations: [model, views],
})
