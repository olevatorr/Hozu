import { feature } from '@tenon/core'
import { interactions } from './contracts.ts'
import { pick, reversed, slideLabel, slides, stats, todoId } from './effects.ts'
import {
  AddTodo,
  Draft,
  RemoveTodo,
  SelectMetric,
  SelectTab,
  Shuffle,
  SlideChanged,
  ToggleSpin,
} from './events.ts'
import { siteMachine } from './machine.ts'
import { About, Showcase } from './views.ts'
import { Carousel, Chart, Globe, Reveal, Sketch, Smooth } from './widgets.ts'

export const site = feature({
  id: 'site',
  styles: [],
  widgets: { Carousel, Chart, Globe, Reveal, Sketch, Smooth },
  intent: {
    summary: 'Marketing page and small app that exercise every presentation capability.',
    invariants: ['Tasks need a non-empty title'],
  },
  imports: [],
  tags: {},
  events: { AddTodo, Draft, RemoveTodo, SelectMetric, SelectTab, Shuffle, SlideChanged, ToggleSpin },
  queries: { slides, stats },
  mutations: {},
  fns: { pick, reversed, slideLabel, todoId },
  machine: siteMachine,
  views: { About, Showcase },
  contracts: { interactions },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
