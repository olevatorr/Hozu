import { feature } from '@hozu/core'
import { addingCountsIds, interactions } from './contracts.ts'
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
  intent: {
    summary: 'Marketing page and small app that exercise every presentation capability.',
    invariants: ['Tasks need a non-empty title'],
  },
  declarations: [
    {
      AddTodo,
      Draft,
      RemoveTodo,
      SelectMetric,
      SelectTab,
      Shuffle,
      SlideChanged,
      ToggleSpin,
      slides,
      stats,
      pick,
      reversed,
      slideLabel,
      todoId,
      Carousel,
      Chart,
      Globe,
      Reveal,
      Sketch,
      Smooth,
      About,
      Showcase,
      addingCountsIds,
      interactions,
      siteMachine,
    },
  ],
})
