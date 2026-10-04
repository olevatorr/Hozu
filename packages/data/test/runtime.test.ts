import { event, feature, mutation, project, query, tag } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, DataRuntimeError, resolvers } from '@hozu/data'
import { appOptionsOf } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { addItem, getCart } from '../../../examples/cart/features/cart/effects.ts'
import { getProduct, listProducts } from '../../../examples/cart/features/catalog/effects.ts'
import cartProject from '../../../examples/cart/hozu.config.ts'

let fresh = 0
const cartApp = '../../../examples/cart/app.ts'
const createResolvers = async () =>
  appOptionsOf((await import(`${cartApp}?fresh=${fresh++}`)).default)!.resolvers

const build = buildProject(cartProject, { sources: true })
const ada = { userId: 'ada' }
const bob = { userId: 'bob' }

describe('cart data runtime', () => {
  const setup = async () => {
    let time = 0
    const data = createDataRuntime({ build, resolvers: await createResolvers(), now: () => time })
    return { data, tick: (ms: number) => (time += ms) }
  }

  it('memoizes reads within a request, never across requests, and serves static data from cache', async () => {
    const { data } = await setup()
    const request = data.scope()
    await Promise.all([
      request.run('catalog.getProduct', { sku: 'mug' }),
      request.run('catalog.getProduct', { sku: 'mug' }),
    ])
    expect(data.stats()).toMatchObject({ fetches: 1, deduped: 1 })
    await data.query(getProduct, { sku: 'mug' })
    expect(data.stats()).toMatchObject({ fetches: 1, hits: 1 })
    const other = (await setup()).data
    await Promise.all([other.query(getProduct, { sku: 'mug' }), other.query(getProduct, { sku: 'mug' })])
    expect(other.stats()).toMatchObject({ fetches: 2, deduped: 0 })
  })

  it('revalidate: expired entries are refetched before returning', async () => {
    const { data, tick } = await setup()
    await data.query(listProducts, {})
    tick(59_999)
    await data.query(listProducts, {})
    expect(data.stats().fetches).toBe(1)
    tick(1)
    await data.query(listProducts, {})
    expect(data.stats().fetches).toBe(2)
  })

  it('user data is read on every request and never enters the cache', async () => {
    const { data } = await setup()
    await data.query(getCart, {}, ada)
    await data.query(getCart, {}, ada)
    expect(data.stats()).toMatchObject({ fetches: 2, hits: 0, entries: 0 })
  })

  it("reads each user with their own session; access: 'signedIn' refuses an anonymous caller", async () => {
    const { data } = await setup()
    await data.mutate(addItem, { sku: 'mug', qty: 1 }, ada)
    expect(await data.query(getCart, {}, ada)).toMatchObject({
      ok: true,
      value: { items: [{ sku: 'mug', qty: 1 }] },
    })
    expect(await data.query(getCart, {}, bob)).toEqual({ ok: true, value: { items: [] } })
    expect(await data.query(getCart, {})).toEqual({
      ok: false,
      error: 'Forbidden',
      data: { message: 'Forbidden' },
    })
  })

  it('a mutation clears the request memo and reports its tags', async () => {
    const { data } = await setup()
    const request = data.scope(ada)
    expect(await request.run('cart.getCart', {})).toMatchObject({ value: { items: [] } })
    const result = await request.run('cart.addItem', { sku: 'mug', qty: 2 })
    expect(result).toMatchObject({ ok: true, invalidated: ['cart.cartTag'] })
    expect(await request.run('cart.getCart', {})).toMatchObject({ value: { items: [{ qty: 2 }] } })
    expect(await data.query(getCart, {}, bob)).toEqual({ ok: true, value: { items: [] } })
  })

  it('returns declared errors without caching them', async () => {
    const { data } = await setup()
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
    const { data } = await setup()
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
    const { data } = await setup()
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
    scope: 'public',
    freshness: 'live',
    tags: () => [pingTag()],
    runs: 'server',
  })
  const stale = query({
    input: z.object({}),
    output: z.number(),
    scope: 'public',
    freshness: { swr: 30 },
    runs: 'server',
  })
  const write = mutation({
    input: z.object({}),
    output: z.number(),
    errors: { Busy: z.object({ retry: z.number() }) },
    invalidates: () => [pingTag()],
    runs: 'server',
    access: 'anyone',
  })
  const p = project({
    schema: zodAdapter,
    routes: {},
    pages: [],
    features: [
      feature({
        id: 'f',
        intent: { summary: 'wiring fixture' },
        declarations: [{ pingTag, Ping, read, stale, write }],
      }),
    ],
  })
  const b = buildProject(p)

  it('HZ021 — missing and duplicate implementations are structured errors', () => {
    const attempt = () =>
      createDataRuntime({
        build: b,
        resolvers: resolvers(p, (implement) => [
          implement(read, () => 1),
          implement(read, () => 2),
          implement(stale, () => 3),
        ]),
      })
    expect(attempt).toThrow(DataRuntimeError)
    try {
      attempt()
    } catch (error) {
      const d = (error as DataRuntimeError).diagnostics
      expect(d.map((x) => [x.code, x.location.pointer, x.message])).toEqual([
        ['HZ021', '/features/f/queries/read', 'f.read is implemented twice'],
        ['HZ021', '/features/f/mutations/write', 'f.write has no implementation'],
      ])
      expect(d.map((x) => x.fix?.summary)).toEqual([
        'Remove one of the two implement(read, …) in the resolvers of app.ts',
        'Add exactly one implement(decl, …) for every query, mutation and endpoint, in the resolvers of app.ts',
      ])
    }
  })

  it('swr: expired public entries are served immediately and refreshed once in the background', async () => {
    let time = 0
    let n = 0
    const data = createDataRuntime({
      build: b,
      now: () => time,
      resolvers: resolvers(p, (implement) => [
        implement(read, () => 0),
        implement(write, () => 0),
        implement(stale, () => ++n),
      ]),
    })
    await data.query(stale, {})
    time = 30_000
    expect(await Promise.all([data.query(stale, {}), data.query(stale, {})])).toEqual([
      { ok: true, value: 1 },
      { ok: true, value: 1 },
    ])
    expect(data.stats()).toMatchObject({ fetches: 2, hits: 2 })
    await new Promise((r) => setTimeout(r, 1))
    expect(await data.query(stale, {})).toEqual({ ok: true, value: 2 })
  })

  it('live queries are never cached; thrown errors and bad output become Unexpected', async () => {
    let n = 0
    const data = createDataRuntime({
      build: b,
      resolvers: resolvers(p, (implement) => [
        implement(stale, () => 0),
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
        implement(stale, () => 0),
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
