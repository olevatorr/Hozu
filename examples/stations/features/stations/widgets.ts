import { ui } from '@hozu/core'
import { z } from 'zod'

const Point = z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number() })

export const StationMap = ui.widget({
  tag: 'div',
  props: z.object({ points: z.array(Point), selected: z.string() }),
  events: { select: z.object({ id: z.string() }) },
  client: new URL('./map.client.ts', import.meta.url),
  load: 'eager',
  wraps: false,
})
export const DistrictChart = ui.widget({
  tag: 'div',
  props: z.object({ rows: z.array(z.object({ district: z.string(), bikes: z.number() })) }),
  events: {},
  client: new URL('./chart.client.ts', import.meta.url),
  load: 'eager',
  wraps: false,
})
export const Counter = ui.widget({
  tag: 'span',
  props: z.object({ value: z.number() }),
  events: {},
  client: new URL('./counter.client.ts', import.meta.url),
  load: 'eager',
  wraps: false,
})
export const FadeIn = ui.widget({
  tag: 'div',
  props: z.object({ key: z.string() }),
  events: {},
  client: new URL('./fade.client.ts', import.meta.url),
  load: 'eager',
  wraps: true,
})
export const Globe = ui.widget({
  tag: 'div',
  props: z.object({ points: z.array(Point) }),
  events: {},
  client: new URL('./globe.client.ts', import.meta.url),
  load: 'eager',
  wraps: false,
})
