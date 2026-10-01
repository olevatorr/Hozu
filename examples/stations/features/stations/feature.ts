import { feature } from '@hozu/core'
import * as components from './components.ts'
import * as model from './model.ts'
import * as views from './views.ts'

export const stations = feature({
  id: 'stations',
  intent: { summary: 'Bike stations on a list, a map, a chart and a globe, with favourites and a tour' },
  declarations: [model, views, components],
})
