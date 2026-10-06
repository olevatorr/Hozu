import { event, feature, fn, invoke, machine, mutation, on, project, tag } from '@hozu/core'
import { buildProject, routeTable } from '@hozu/core/ir'
import { compileMachine, enter, init, type Snapshot, transition } from '@hozu/machine'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import cartProject from '../../../examples/cart/hozu.config.ts'

const built = buildProject(cartProject)
const cart = compileMachine(built.ir.features.cart!, built.bindings.fns, routeTable(built.ir))
const idle = { pending: { sku: '', qty: 1 }, error: null, orderId: null }

describe('compiled cart machine', () => {
  it('starts in the initial state without effects', () => {
    expect(init(cart)).toEqual({
      snapshot: { state: 'idle', context: idle, entry: 1 },
      effects: [],
      taken: null,
    })
    expect(cart.transitions).toHaveLength(15)
  })

  it('fires the first transition whose guard passes and emits the invoke as data', () => {
    const start = init(cart).snapshot
    const step = transition(cart, start, {
      type: 'event',
      event: 'cart.AddItem',
      payload: { sku: 'mug', qty: 2 },
    })
    expect(step.taken).toBe('idle/on/cart.AddItem/0')
    expect(step.snapshot).toEqual({
      state: 'adding',
      context: { ...idle, pending: { sku: 'mug', qty: 2 } },
      entry: 2,
    })
    expect(step.effects).toEqual([
      { type: 'invoke', entry: 2, effect: 'cart.addItem', input: { sku: 'mug', qty: 2 } },
    ])
    expect(start.context).toEqual(idle)

    const tooMany = transition(cart, start, {
      type: 'event',
      event: 'cart.AddItem',
      payload: { sku: 'mug', qty: 11 },
    })
    expect(tooMany.taken).toBe('idle/on/cart.AddItem/1')
    expect(tooMany.snapshot.state).toBe('error')
    expect(tooMany.effects).toEqual([{ type: 'timer', entry: 2, ms: 5000 }])
  })

  it('ignores unhandled events and stale effect results', () => {
    const start = init(cart).snapshot
    expect(transition(cart, start, { type: 'event', event: 'cart.Dismiss', payload: {} }).taken).toBeNull()
    const adding = transition(cart, start, {
      type: 'event',
      event: 'cart.AddItem',
      payload: { sku: 'a', qty: 1 },
    }).snapshot
    expect(transition(cart, adding, { type: 'done', entry: 1, result: { items: [] } })).toEqual({
      snapshot: adding,
      effects: [],
      taken: null,
    })
    expect(transition(cart, adding, { type: 'done', entry: 2, result: { items: [] } }).snapshot.state).toBe(
      'idle',
    )
  })

  it('routes undeclared errors to Unexpected', () => {
    const adding = enter(cart, 'adding', idle, 7).snapshot
    const step = transition(cart, adding, { type: 'failed', entry: 7, error: 'Timeout', data: null })
    expect(step.taken).toBe('adding/invoke/failed/Unexpected/0')
    expect(step.snapshot.context).toMatchObject({ error: 'Timeout' })
  })

  it('fires timers, navigates, and freezes in final states', () => {
    const error = enter(cart, 'error', { ...idle, error: 'x' }, 3).snapshot
    expect(transition(cart, error, { type: 'timer', entry: 3, ms: 5000 }).snapshot).toEqual({
      state: 'idle',
      context: idle,
      entry: 4,
    })
    const paying = enter(cart, 'checkingOut', idle, 5).snapshot
    const placed = transition(cart, paying, { type: 'done', entry: 5, result: { orderId: 'o-9' } })
    expect(placed.effects).toEqual([{ type: 'navigate', url: '/order/placed' }])
    expect(placed.snapshot).toMatchObject({ state: 'placed', context: { orderId: 'o-9' } })
    expect(
      transition(cart, placed.snapshot, {
        type: 'event',
        event: 'cart.AddItem',
        payload: { sku: 'a', qty: 1 },
      }).taken,
    ).toBeNull()
  })
})

describe('assign ops and fn bindings', () => {
  const Ping = event({ payload: z.object({ sku: z.string(), n: z.number() }) })
  const Drop = event({ payload: z.object({ sku: z.string() }) })
  const total = fn({
    input: z.array(z.object({ sku: z.string(), n: z.number() })),
    output: z.number(),
    impl: (xs) => xs.reduce((s, x) => s + x.n, 0),
  })
  const isBig = fn({ input: z.number(), output: z.boolean(), impl: (n) => n > 100 })
  const m = machine({
    context: z.object({
      items: z.array(z.object({ sku: z.string(), n: z.number() })),
      count: z.number(),
      sum: z.number(),
    }),
    initialContext: { items: [], count: 0, sum: 0 },
    initial: 'open',
    states: ({ ctx }) => ({
      open: {
        on: [
          on(Ping, { target: 'closed', guard: (p) => isBig(p.n) }),
          on(Ping, {
            target: 'open',
            assign: (p) => {
              ctx.items.push(p)
              ctx.count += 1
              ctx.sum = total(ctx.items)
            },
          }),
          on(Drop, {
            target: 'open',
            assign: (p) => {
              ctx.items = ctx.items.filter((item) => item.sku !== p.sku)
            },
          }),
        ],
      },
      closed: { final: true },
    }),
  })
  const f = feature({
    id: 'f',
    intent: { summary: 'ops fixture' },
    declarations: [{ Ping, Drop, total, isBig, m }],
  })
  const b = buildProject(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))
  const compiled = compileMachine(b.ir.features.f!, b.bindings.fns)

  it('applies assigns sequentially with copy-on-write', () => {
    let s: Snapshot = init(compiled).snapshot
    for (const [sku, n] of [
      ['a', 1],
      ['b', 2],
      ['a', 3],
    ] as const)
      s = transition(compiled, s, { type: 'event', event: 'f.Ping', payload: { sku, n } }).snapshot
    expect(s.context).toEqual({
      items: [
        { sku: 'a', n: 1 },
        { sku: 'b', n: 2 },
        { sku: 'a', n: 3 },
      ],
      count: 3,
      sum: 6,
    })
    const dropped = transition(compiled, s, { type: 'event', event: 'f.Drop', payload: { sku: 'a' } })
    expect(dropped.snapshot.context).toEqual({ items: [{ sku: 'b', n: 2 }], count: 3, sum: 6 })
    expect((s.context as { items: unknown[] }).items).toHaveLength(3)
  })

  it('evaluates fn guards', () => {
    const step = transition(compiled, init(compiled).snapshot, {
      type: 'event',
      event: 'f.Ping',
      payload: { sku: 'x', n: 500 },
    })
    expect(step.taken).toBe('open/on/f.Ping/0')
    expect(step.snapshot.state).toBe('closed')
  })

  it('refuses to compile without fn implementations', () => {
    expect(() => compileMachine(b.ir.features.f!, {})).toThrow(/No implementation bound for fn f\.isBig/)
  })
})

describe("target: 'previous'", () => {
  const Pause = event({ payload: z.object({}) })
  const Flash = event({ payload: z.object({}) })
  const m = machine({
    context: z.object({}),
    initialContext: {},
    initial: 'running',
    states: () => ({
      running: { on: [on(Pause, { target: 'paused' }), on(Flash, { target: 'flash' })] },
      paused: { on: [on(Flash, { target: 'flash' }), on(Pause, { target: 'paused' })] },
      flash: { on: [on(Flash, { target: 'previous' })], after: [{ ms: 1000, target: 'previous' }] },
    }),
  })
  const f = feature({ id: 'p', intent: { summary: 'previous fixture' }, declarations: [{ Pause, Flash, m }] })
  const b = buildProject(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))
  const compiled = compileMachine(b.ir.features.p!, b.bindings.fns)
  const send = (s: Snapshot, e: string) =>
    transition(compiled, s, { type: 'event', event: `p.${e}`, payload: {} })

  it('returns to the state the machine came from', () => {
    expect(b.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const paused = send(init(compiled).snapshot, 'Pause').snapshot
    expect(paused).toMatchObject({ state: 'paused', previous: 'running' })
    const flash = send(paused, 'Flash').snapshot
    expect(flash).toMatchObject({ state: 'flash', previous: 'paused' })
    const back = transition(compiled, flash, { type: 'timer', entry: flash.entry, ms: 1000 })
    expect(back.taken).toBe('flash/after/0')
    expect(back.snapshot).toMatchObject({ state: 'paused', previous: 'flash' })
    const fromRunning = send(send(init(compiled).snapshot, 'Flash').snapshot, 'Flash')
    expect(fromRunning.snapshot.state).toBe('running')
  })

  it('keeps the previous state across a re-entry of the same state', () => {
    const paused = send(send(init(compiled).snapshot, 'Pause').snapshot, 'Pause').snapshot
    expect(paused).toMatchObject({ state: 'paused', previous: 'running', entry: 3 })
  })

  it('skips the transition when there is nothing to return to', () => {
    const start = enter(compiled, 'flash', {}).snapshot
    expect(send(start, 'Flash').taken).toBeNull()
    expect(enter(compiled, 'flash', {}, 1, 'paused').snapshot.previous).toBe('paused')
  })
})

describe('a boolean field as a guard (ADR 0063 D3)', () => {
  const Tick = event({ payload: z.object({ on: z.boolean() }) })
  const m = machine({
    context: z.object({ auto: z.boolean() }),
    initialContext: { auto: false },
    initial: 'idle',
    states: ({ ctx }) => ({
      idle: {
        on: [
          on(Tick, { target: 'refreshing', guard: () => ctx.auto }),
          on(Tick, {
            target: 'idle',
            assign: (e) => {
              ctx.auto = e.on
            },
          }),
        ],
      },
      refreshing: { final: true },
    }),
  })
  const f = feature({ id: 'g', intent: { summary: 'guard fixture' }, declarations: [{ Tick, m }] })
  const b = buildProject(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))
  const compiled = compileMachine(b.ir.features.g!, b.bindings.fns)

  it('fires only while the field is true', () => {
    expect(b.diagnostics).toEqual([])
    const tick = (s: Snapshot, value: boolean) =>
      transition(compiled, s, { type: 'event', event: 'g.Tick', payload: { on: value } }).snapshot
    const armed = tick(init(compiled).snapshot, true)
    expect(armed.state).toBe('idle')
    expect(tick(armed, false).state).toBe('refreshing')
  })
})

describe('refresh and copy on a transition (ADR 0064 A, D)', () => {
  const Refresh = event({ payload: z.object({ id: z.string() }) })
  const Copy = event({ payload: z.object({ text: z.string() }) })
  const listTag = tag({ param: null })
  const itemTag = tag({ param: z.string() })
  const m = machine({
    context: z.object({}),
    initialContext: {},
    initial: 'idle',
    on: () => [on(Copy, { copy: (e) => e.text })],
    states: () => ({
      idle: { on: [on(Refresh, { target: 'idle', refresh: (e) => [listTag(), itemTag(e.id)] })] },
    }),
  })
  const f = feature({
    id: 'r',
    intent: { summary: 'refresh fixture' },
    declarations: [{ Refresh, Copy, listTag, itemTag, m }],
  })
  const b = buildProject(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))
  const compiled = compileMachine(b.ir.features.r!, b.bindings.fns)

  it('emits the tag keys to read again and the text to copy as effects', () => {
    expect(b.diagnostics).toEqual([])
    expect(b.ir.features.r!.machine!.states.idle!.on['r.Refresh']![0]!.refresh).toEqual([
      { tag: 'r.listTag', param: null },
      { tag: 'r.itemTag', param: { ref: 'event', path: ['id'] } },
    ])
    const start = init(compiled).snapshot
    const refreshed = transition(compiled, start, { type: 'event', event: 'r.Refresh', payload: { id: 'a' } })
    expect(refreshed.effects).toEqual([{ type: 'refresh', tags: ['r.listTag', 'r.itemTag("a")'] }])
    const copied = transition(compiled, start, { type: 'event', event: 'r.Copy', payload: { text: 'AAPL' } })
    expect(copied.effects).toEqual([{ type: 'copy', text: 'AAPL' }])
  })
})

describe('an on without target stays (ADR 0064 F)', () => {
  const Type = event({ payload: z.object({ text: z.string() }) })
  const Save = event({ payload: z.object({}) })
  const m = machine({
    context: z.object({ text: z.string() }),
    initialContext: { text: '' },
    initial: 'toast',
    on: ({ ctx }) => [
      on(Type, {
        assign: (e) => {
          ctx.text = e.text
        },
      }),
    ],
    states: () => ({
      toast: { on: [on(Save, { target: 'toast' })], after: [{ ms: 3000, target: 'quiet' }] },
      quiet: { on: [] },
    }),
  })
  const f = feature({ id: 's', intent: { summary: 'stay fixture' }, declarations: [{ Type, Save, m }] })
  const b = buildProject(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))
  const compiled = compileMachine(b.ir.features.s!, b.bindings.fns)

  it('keeps the entry and the timers; naming the state enters it again', () => {
    expect(b.ir.features.s!.machine!.states.toast!.on['s.Type']![0]!.stay).toBe(true)
    expect(b.ir.features.s!.machine!.states.toast!.on['s.Save']![0]!.stay).toBeUndefined()
    const start = init(compiled)
    expect(start.effects).toEqual([{ type: 'timer', entry: 1, ms: 3000 }])
    const typed = transition(compiled, start.snapshot, {
      type: 'event',
      event: 's.Type',
      payload: { text: 'a' },
    })
    expect(typed.snapshot).toEqual({ state: 'toast', context: { text: 'a' }, entry: 1 })
    expect(typed.effects).toEqual([])
    expect(transition(compiled, typed.snapshot, { type: 'timer', entry: 1, ms: 3000 }).snapshot.state).toBe(
      'quiet',
    )
    const saved = transition(compiled, typed.snapshot, { type: 'event', event: 's.Save', payload: {} })
    expect(saved.snapshot.entry).toBe(2)
    expect(saved.effects).toEqual([{ type: 'timer', entry: 2, ms: 3000 }])
  })
})

describe("target: 'previous' skips busy states (ADR 0065 B)", () => {
  const Save = event({ payload: z.object({}) })
  const lookup = mutation({ input: z.object({}), output: z.object({}), runs: 'browser' })
  const store = mutation({ input: z.object({}), output: z.object({}), runs: 'browser' })
  const m = machine({
    context: z.object({}),
    initialContext: {},
    initial: 'paused',
    states: () => ({
      paused: { on: [on(Save, { target: 'looking' })] },
      looking: { invoke: invoke(lookup, { input: {}, done: 'saving', failed: { Unexpected: 'previous' } }) },
      saving: { invoke: invoke(store, { input: {}, done: 'previous', failed: { Unexpected: 'previous' } }) },
    }),
  })
  const f = feature({ id: 'c', intent: { summary: 'chain' }, declarations: [{ Save, lookup, store, m }] })
  const b = buildProject(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))
  const compiled = compileMachine(b.ir.features.c!, b.bindings.fns)

  it('returns from a chain of busy states to where the person was', () => {
    const looking = transition(compiled, init(compiled).snapshot, {
      type: 'event',
      event: 'c.Save',
      payload: {},
    })
    const saving = transition(compiled, looking.snapshot, { type: 'done', entry: 2, result: {} })
    expect(saving.snapshot).toMatchObject({ state: 'saving', previous: 'paused' })
    const back = transition(compiled, saving.snapshot, { type: 'done', entry: 3, result: {} })
    expect(back.snapshot.state).toBe('paused')
    expect(back.effects).toEqual([])
  })
})
