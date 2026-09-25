import { event, feature, mutation, project, query, tag } from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { createDataRuntime, DataRuntimeError, resolvers } from '@tenon/data'
import { zodAdapter } from '@tenon/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { addItem, getCart } from '../../../examples/cart/features/cart/effects.ts'
import { getProduct, listProducts } from '../../../examples/cart/features/catalog/effects.ts'
import { createResolvers } from '../../../examples/cart/server.ts'
import cartProject from '../../../examples/cart/tenon.config.ts'

const build = buildProject(cartProject, { sources: true })
const ada = { userId: 'ada' }
const bob = { userId: 'bob' }

describe('cart data runtime', () => {
  const setup = () => {
    let time = 0
    const data = createDataRuntime({ build, resolvers: createResolvers(), now: () => time })
    return { data, tick: (ms: number) => (time += ms) }
  }

  it('deduplicates concurrent reads and serves static data from cache', async () => {
    const { data } = setup()
    await Promise.all([data.query(getProduct, { sku: 'mug' }), data.query(getProduct, { sku: 'mug' })])
    await data.query(getProduct, { sku: 'mug' })
    expect(data.stats()).toMatchObject({ fetches: 1, deduped: 1, hits: 1 })
  })

  it('revalidate: expired entries are refetched before returning', async () => {
    const { data, tick } = setup()
    await data.query(listProducts, {})
    tick(59_999)
    await data.query(listProducts, {})
    expect(data.stats().fetches).toBe(1)
    tick(1)
    await data.query(listProducts, {})
    expect(data.stats().fetches).toBe(2)
  })

  it('swr: expired entries are served immediately and refreshed in the background', async () => {
    const { data, tick } = setup()
    await data.query(getCart, {}, ada)
    tick(30_000)
    const pending = data.query(getCart, {}, ada)
    expect(data.stats()).toMatchObject({ fetches: 2, hits: 1 })
    expect(await pending).toEqual({ ok: true, value: { items: [] } })
  })

  it('isolates user partitions and requires a session for user-scoped queries', async () => {
    const { data } = setup()
    await data.mutate(addItem, { sku: 'mug', qty: 1 }, ada)
    expect(await data.query(getCart, {}, ada)).toMatchObject({
      ok: true,
      value: { items: [{ sku: 'mug', qty: 1 }] },
    })
    expect(await data.query(getCart, {}, bob)).toEqual({ ok: true, value: { items: [] } })
    expect(await data.query(getCart, {})).toEqual({
      ok: false,
      error: 'Unexpected',
      data: { message: 'cart.getCart is user-scoped and requires a session' },
    })
  })

  it('mutations invalidate by tag in the caller partition only', async () => {
    const { data } = setup()
    await data.query(getCart, {}, ada)
    await data.query(getCart, {}, bob)
    const result = await data.mutate(addItem, { sku: 'mug', qty: 2 }, ada)
    expect(result).toMatchObject({ ok: true, invalidated: ['cart.cartTag'] })
    expect(data.stats().invalidated).toBe(1)
    expect(await data.query(getCart, {}, ada)).toMatchObject({ value: { items: [{ qty: 2 }] } })
    const fetches = data.stats().fetches
    await data.query(getCart, {}, bob)
    expect(data.stats().fetches).toBe(fetches)
  })

  it('returns declared errors without caching them', async () => {
    const { data } = setup()
    expect(await data.mutate(addItem, { sku: 'tee', qty: 1 }, ada)).toEqual({
      ok: false,
      error: 'OutOfStock',
      data: { sku: 'tee', available: 0 },
      invalidated: [],
    })
    expect(await data.query(getProduct, { sku: 'nope' })).toEqual({
      ok: false,
      error: 'NotFound',
      data: { sku: 'nope' },
    })
    await data.query(getProduct, { sku: 'nope' })
    expect(data.stats().fetches).toBe(3)
  })

  it('rejects invalid input and session before running resolvers', async () => {
    const { data } = setup()
    expect(await data.query(getProduct, { sku: 1 } as never)).toMatchObject({
      error: 'Unexpected',
      data: { message: expect.stringMatching(/^Invalid input for catalog.getProduct/) },
    })
    expect(await data.query(getCart, {}, { user: 'x' })).toMatchObject({
      error: 'Unexpected',
      data: { message: expect.stringMatching(/^Invalid session/) },
    })
    expect(data.stats().fetches).toBe(0)
  })

  it('invalidates parameterized tags exactly', async () => {
    const { data } = setup()
    await data.query(getProduct, { sku: 'mug' })
    await data.query(getProduct, { sku: 'tee' })
    expect(data.invalidate(['catalog.productTag("mug")'])).toBe(1)
    await data.query(getProduct, { sku: 'mug' })
    await data.query(getProduct, { sku: 'tee' })
    expect(data.stats()).toMatchObject({ fetches: 3, hits: 1 })
  })
})

describe('resolver wiring', () => {
  const Ping = event({ payload: z.object({}) })
  const pingTag = tag({ param: null })
  const read = query({
    input: z.object({}),
    output: z.number(),
    errors: {},
    scope: 'public',
    freshness: 'live',
    tags: () => [pingTag()],
  })
  const write = mutation({
    input: z.object({}),
    output: z.number(),
    errors: { Busy: z.object({ retry: z.number() }) },
    invalidates: () => [pingTag()],
  })
  const p = project({
    schema: zodAdapter,
    styles: null,
    session: null,
    site: null,
    routes: {},
    pages: [],
    features: [
      feature({
        id: 'f',
        styles: [],
        intent: { summary: 'wiring fixture', invariants: [] },
        imports: [],
        tags: { pingTag },
        events: { Ping },
        queries: { read },
        mutations: { write },
        fns: {},
        machine: null,
        views: {},
        contracts: {},
        exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
      }),
    ],
  })
  const b = buildProject(p)

  it('TN021 — missing and duplicate implementations are structured errors', () => {
    const attempt = () =>
      createDataRuntime({
        build: b,
        resolvers: resolvers(p, (implement) => [implement(read, () => 1), implement(read, () => 2)]),
      })
    expect(attempt).toThrow(DataRuntimeError)
    try {
      attempt()
    } catch (error) {
      const d = (error as DataRuntimeError).diagnostics
      expect(d.map((x) => [x.code, x.location.pointer, x.message])).toEqual([
        ['TN021', '/features/f/queries/read', 'f.read is implemented twice'],
        ['TN021', '/features/f/mutations/write', 'f.write has no implementation'],
      ])
    }
  })

  it('live queries are never cached; thrown errors and bad output become Unexpected', async () => {
    let n = 0
    const data = createDataRuntime({
      build: b,
      resolvers: resolvers(p, (implement) => [
        implement(read, () => ++n),
        implement(write, (_, { fail }) => (n > 1 ? fail('Busy', { retry: 5 }) : ('x' as never))),
      ]),
    })
    expect(await data.query(read, {})).toEqual({ ok: true, value: 1 })
    expect(await data.query(read, {})).toEqual({ ok: true, value: 2 })
    expect(await data.mutate(write, {})).toMatchObject({ ok: false, error: 'Busy', data: { retry: 5 } })
    const broken = createDataRuntime({
      build: b,
      resolvers: resolvers(p, (implement) => [
        implement(read, () => {
          throw new Error('db down')
        }),
        implement(write, () => 'x' as never),
      ]),
    })
    expect(await broken.query(read, {})).toEqual({
      ok: false,
      error: 'Unexpected',
      data: { message: 'db down' },
    })
    expect(await broken.mutate(write, {})).toMatchObject({
      error: 'Unexpected',
      data: { message: expect.stringMatching(/^Invalid output from f.write/) },
    })
  })
})
