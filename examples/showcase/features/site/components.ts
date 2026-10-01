import { ui } from '@hozu/core'
import { z } from 'zod'

export const Globe = ui.component({
  tag: 'div',
  props: z.object({ spin: z.boolean() }),
  client: new URL('./components/globe.client.ts', import.meta.url),
  load: 'visible',
  children: true,
  render: ({ children }) => ui.div({}, children),
})

export const Reveal = ui.component({
  tag: 'div',
  props: z.object({}),
  client: new URL('./components/reveal.client.ts', import.meta.url),
  load: 'eager',
  children: true,
  render: ({ children }) => ui.div({}, children),
})

export const Smooth = ui.component({
  tag: 'div',
  props: z.object({}),
  client: new URL('./components/smooth.client.ts', import.meta.url),
  load: 'eager',
  children: true,
  render: ({ children }) => ui.div({}, children),
})

export const Carousel = ui.component({
  tag: 'div',
  props: z.object({ perView: z.number() }),
  emits: { changed: z.object({ index: z.number() }) },
  client: new URL('./components/carousel.client.ts', import.meta.url),
  load: 'visible',
  children: true,
  render: ({ children }) => ui.div({}, children),
})

export const Chart = ui.component({
  tag: 'div',
  props: z.object({ label: z.string(), labels: z.array(z.string()), values: z.array(z.number()) }),
  client: new URL('./components/chart.client.ts', import.meta.url),
  load: 'visible',
  children: true,
  render: ({ children }) => ui.div({}, children),
})

export const Sketch = ui.component({
  tag: 'div',
  props: z.object({ hue: z.number() }),
  client: new URL('./components/sketch.client.ts', import.meta.url),
  load: 'visible',
  children: true,
  render: ({ children }) => ui.div({}, children),
})
