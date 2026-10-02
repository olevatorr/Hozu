import { feature, project, query, tag } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, Lru, memoryDataCache, resolvers } from '@hozu/data'
import { memoryCache } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const itemTag = tag({ param: z.string() })
const byId = query({
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string(), n: z.number() }),
  scope: 'public',
  freshness: 'static',
  tags: (i) => [itemTag(i.id)],
  runs: 'server',
})
const app = project({
  schema: zodAdapter,
  routes: {},
  pages: [],
  features: [
    feature({ id: 'items', intent: { summary: 'bounded cache' }, declarations: [{ itemTag, byId }] }),
  ],
})
const build = buildProject(app, { sources: false })

function runtime(maxEntries: number) {
  let reads = 0
  const data = createDataRuntime({
    build,
    cache: memoryDataCache({ maxEntries }),
    resolvers: resolvers(app, (implement) => [implement(byId, ({ id }) => ({ id, n: ++reads }))]),
  })
  return { data, reads: () => reads }
}

describe('the bounded data cache (ADR 0050 A)', () => {
  it('keeps at most maxEntries, drops the least recently used, and recomputes an evicted entry', async () => {
    const { data, reads } = runtime(2)
    await data.query(byId, { id: 'a' })
    await data.query(byId, { id: 'b' })
    await data.query(byId, { id: 'a' })
    await data.query(byId, { id: 'c' })
    expect(data.stats()).toMatchObject({ entries: 2, evictions: 1, fetches: 3, hits: 1 })
    await data.query(byId, { id: 'a' })
    expect(reads()).toBe(3)
    expect(await data.query(byId, { id: 'b' })).toEqual({ ok: true, value: { id: 'b', n: 4 } })
  })

  it('drops only the entries a tag names, and an invalidated read is fetched again', async () => {
    const { data } = runtime(10)
    await data.query(byId, { id: 'a' })
    await data.query(byId, { id: 'b' })
    expect(data.invalidate(['items.itemTag("a")'])).toBe(1)
    expect(data.invalidate(['items.itemTag("a")'])).toBe(0)
    expect(data.stats().entries).toBe(1)
    expect(await data.query(byId, { id: 'a' })).toEqual({ ok: true, value: { id: 'a', n: 3 } })
    expect(await data.query(byId, { id: 'b' })).toEqual({ ok: true, value: { id: 'b', n: 2 } })
  })

  it('never stores a result that was invalidated while it was read', async () => {
    let release = () => {}
    let n = 0
    const data = createDataRuntime({
      build,
      resolvers: resolvers(app, (implement) => [
        implement(byId, async ({ id }) => {
          n++
          if (n === 1) await new Promise<void>((r) => (release = r))
          return { id, n }
        }),
      ]),
    })
    const first = data.query(byId, { id: 'a' })
    await new Promise((r) => setTimeout(r, 0))
    data.invalidate(['items.itemTag("a")'])
    release()
    expect(await first).toEqual({ ok: true, value: { id: 'a', n: 1 } })
    expect(await data.query(byId, { id: 'a' })).toEqual({ ok: true, value: { id: 'a', n: 2 } })
  })

  it("reads 'static' data again after staticTtl, and never without it", async () => {
    let time = 0
    let reads = 0
    const make = (staticTtl?: number) =>
      createDataRuntime({
        build,
        now: () => time,
        ...(staticTtl === undefined ? {} : { staticTtl }),
        resolvers: resolvers(app, (implement) => [implement(byId, ({ id }) => ({ id, n: ++reads }))]),
      })
    const bounded = make(60)
    const forever = make()
    await bounded.query(byId, { id: 'a' })
    await forever.query(byId, { id: 'a' })
    time = 60_000
    await bounded.query(byId, { id: 'a' })
    await forever.query(byId, { id: 'a' })
    expect([bounded.stats().fetches, forever.stats().fetches]).toEqual([2, 1])
  })

  it('refuses a bound that is not a positive integer', () => {
    expect(() => new Lru(0)).toThrow('The cache bound must be a positive integer, got 0')
  })
})

describe('the bounded page cache (ADR 0050 A)', () => {
  const page = (tags: string[]) => ({ html: '', status: 200, redirect: null, at: 0, ttl: 0, tags })

  it('keeps at most maxPages and deletes only the pages carrying a tag', async () => {
    const cache = memoryCache({ maxPages: 2 })
    await cache.set('/a', page(['t1']))
    await cache.set('/b', page(['t2']))
    await cache.get('/a')
    await cache.set('/c', page(['t1', 't2']))
    expect([cache.size, cache.evictions, await cache.get('/b')]).toEqual([2, 1, undefined])
    expect(await cache.deleteTags(['t1'])).toBe(2)
    expect(cache.size).toBe(0)
  })
})
