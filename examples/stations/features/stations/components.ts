import { ui } from '@hozu/core'
import { z } from 'zod'

const Point = z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number() })

export const StationMap = ui.component({
  tag: 'div',
  props: z.object({ points: z.array(Point), selected: z.string() }),
  emits: { select: z.object({ id: z.string() }) },
  client: new URL('./map.client.ts', import.meta.url),
  load: 'eager',
  render: () => ui.div({}, []),
})
export const DistrictChart = ui.component({
  tag: 'div',
  props: z.object({ rows: z.array(z.object({ district: z.string(), bikes: z.number() })) }),
  client: new URL('./chart.client.ts', import.meta.url),
  load: 'eager',
  render: () => ui.div({}, []),
})
export const Counter = ui.component({
  tag: 'span',
  props: z.object({ value: z.number() }),
  client: new URL('./counter.client.ts', import.meta.url),
  load: 'eager',
  children: true,
  render: ({ children }) => ui.span({}, children),
})
export const FadeIn = ui.component({
  tag: 'div',
  props: z.object({ key: z.string() }),
  client: new URL('./fade.client.ts', import.meta.url),
  load: 'eager',
  children: true,
  render: ({ children }) => ui.div({}, children),
})
export const Globe = ui.component({
  tag: 'div',
  props: z.object({ points: z.array(Point) }),
  client: new URL('./globe.client.ts', import.meta.url),
  load: 'eager',
  render: () => ui.div({}, []),
})
