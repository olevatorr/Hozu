import { feature, project, query } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const Group = z.object({ key: z.int(), count: z.int(), total: z.int() }).meta({ title: 'Group' })

export const echo = query({
  input: z.object({ n: z.int() }),
  output: z.object({ n: z.int() }),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})

export const crunch = query({
  input: z.object({ rows: z.int(), seed: z.int() }),
  output: z.array(Group),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})

export const fanout = query({
  input: z.object({ calls: z.int(), seed: z.int() }),
  output: z.object({ bytes: z.int() }),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})

export default project({
  schema: zodAdapter,
  env: { server: z.object({ BENCH_SECRET: z.string().min(16) }) },
  routes: {},
  pages: [],
  features: [
    feature({
      id: 'work',
      intent: { summary: 'ADR 0068 workloads' },
      declarations: [{ echo, crunch, fanout }],
    }),
  ],
})

export function crunchRows(rows: number, seed: number) {
  const groups = new Map<number, { key: number; count: number; total: number }>()
  let x = seed
  for (let i = 0; i < rows; i++) {
    x = (x * 48271) % 2147483647
    const key = x % 500
    const g = groups.get(key) ?? { key, count: 0, total: 0 }
    g.count++
    g.total += x % 1000
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.key - b.key).slice(0, 10)
}
