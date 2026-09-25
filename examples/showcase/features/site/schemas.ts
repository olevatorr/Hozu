import { z } from 'zod'

export const Tab = z.enum(['design', 'build', 'ship'])
export const Metric = z.enum(['visits', 'signups'])
export const Todo = z.object({ id: z.string(), title: z.string() })
export const Todos = z.array(Todo)
export const Slide = z.object({ id: z.string(), title: z.string(), body: z.string(), hue: z.number() })
export const Series = z.object({
  label: z.string(),
  labels: z.array(z.string()),
  values: z.array(z.number()),
})
export const Stats = z.object({ visits: Series, signups: Series })
export const Context = z.object({
  tab: Tab,
  todos: Todos,
  draft: z.string(),
  next: z.number(),
  metric: Metric,
  slide: z.number(),
  spin: z.boolean(),
})
