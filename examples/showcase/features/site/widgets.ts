import { ui } from '@tenon/core'
import { z } from 'zod'

export const Globe = ui.widget({
  tag: 'div',
  props: z.object({ spin: z.boolean() }),
  events: {},
  client: new URL('./widgets/globe.client.ts', import.meta.url),
  load: 'visible',
  wraps: false,
})

export const Reveal = ui.widget({
  tag: 'div',
  props: z.object({}),
  events: {},
  client: new URL('./widgets/reveal.client.ts', import.meta.url),
  load: 'eager',
  wraps: true,
})

export const Smooth = ui.widget({
  tag: 'div',
  props: z.object({}),
  events: {},
  client: new URL('./widgets/smooth.client.ts', import.meta.url),
  load: 'eager',
  wraps: true,
})

export const Carousel = ui.widget({
  tag: 'div',
  props: z.object({ perView: z.number() }),
  events: { changed: z.object({ index: z.number() }) },
  client: new URL('./widgets/carousel.client.ts', import.meta.url),
  load: 'visible',
  wraps: true,
})

export const Chart = ui.widget({
  tag: 'div',
  props: z.object({ label: z.string(), labels: z.array(z.string()), values: z.array(z.number()) }),
  events: {},
  client: new URL('./widgets/chart.client.ts', import.meta.url),
  load: 'visible',
  wraps: false,
})

export const Sketch = ui.widget({
  tag: 'div',
  props: z.object({ hue: z.number() }),
  events: {},
  client: new URL('./widgets/sketch.client.ts', import.meta.url),
  load: 'visible',
  wraps: false,
})
