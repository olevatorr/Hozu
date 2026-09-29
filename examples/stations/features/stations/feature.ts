import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'
import * as widgets from './widgets.ts'

export const stations = feature({
  id: 'stations',
  intent: { summary: 'Bike stations on a list, a map, a chart and a globe, with favourites and a tour' },
  declarations: [model, views, widgets],
})
