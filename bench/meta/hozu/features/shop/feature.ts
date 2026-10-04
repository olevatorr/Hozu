import { feature } from '@hozu/core'
import * as contracts from './contracts.ts'
import * as model from './model.ts'
import * as views from './views.ts'

export const shop = feature({
  id: 'shop',
  intent: { summary: 'Benchmark page' },
  declarations: [model, views, contracts],
})
