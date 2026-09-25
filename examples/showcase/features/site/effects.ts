import { fn, query } from '@tenon/core'
import { z } from 'zod'
import { Metric, Series, Slide, Stats, Todos } from './schemas.ts'

export const slides = query({
  input: z.object({}),
  output: z.array(Slide),
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})

export const stats = query({
  input: z.object({}),
  output: Stats,
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})

export const todoId = fn({ input: z.number(), output: z.string(), impl: (n) => `t${n}` })

export const reversed = fn({ input: Todos, output: Todos, impl: (items) => [...items].reverse() })

export const pick = fn({
  input: z.object({ stats: Stats, metric: Metric }),
  output: Series,
  impl: ({ stats, metric }) => stats[metric],
})

export const slideLabel = fn({
  input: z.object({ index: z.number(), total: z.number() }),
  output: z.string(),
  impl: ({ index, total }) => `${index + 1} / ${total}`,
})
