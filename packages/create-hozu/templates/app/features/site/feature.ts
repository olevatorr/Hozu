import { feature } from '@hozu/core'
import * as views from './views.ts'

export const site = feature({
  id: 'site',
  intent: { summary: 'The start page' },
  declarations: [views],
})
