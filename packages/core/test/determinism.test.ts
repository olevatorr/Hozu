import { event, feature, invoke, machine, mutation, on, op, type ProjectDecl, project, ui } from '@tenon/core'
import { buildProject, hashJson } from '@tenon/core/ir'
import { zodAdapter } from '@tenon/schema-zod'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import cartProject from '../../../examples/cart/tenon.config.ts'
import type { FeatureConfig, ProjectConfig } from '../src/builders/feature.ts'
import { DECL, type DeclInfo } from '../src/model/decl.ts'

type Rand = () => number

const def = <D>(value: unknown): D => (value as Record<symbol, DeclInfo>)[DECL]!.def as D

const shuffle = <T>(items: readonly T[], rand: Rand): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const shuffleRecord = <T>(record: Record<string, T>, rand: Rand): Record<string, T> =>
  Object.fromEntries(shuffle(Object.entries(record), rand))

const seeded = (seed: number): Rand => {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 2 ** 32
  }
}

function reorderCart(rand: Rand): ProjectDecl {
  const config = def<ProjectConfig>(cartProject)
  const originals = config.features
  const clones = new Map<object, ReturnType<typeof feature>>()
  for (const f of originals) {
    const c = def<FeatureConfig>(f)
    const records = ['tags', 'events', 'queries', 'mutations', 'fns', 'views', 'contracts'] as const
    const next = { ...c } as FeatureConfig
    for (const key of records)
      (next as unknown as Record<string, unknown>)[key] = shuffleRecord(
        c[key] as Record<string, unknown>,
        rand,
      )
    next.exports = Object.fromEntries(
      shuffle(Object.entries(c.exports), rand).map(([k, list]) => [k, shuffle(list as unknown[], rand)]),
    ) as unknown as FeatureConfig['exports']
    next.imports = c.imports.map((i) => clones.get(i) ?? i)
    clones.set(f, feature(next))
  }
  return project({
    schema: config.schema,
    session: config.session,
    routes: shuffleRecord(config.routes, rand),
    features: shuffle(
      originals.map((f) => clones.get(f)!),
      rand,
    ),
  })
}

function freshProject(rand: Rand): ProjectDecl {
  const Payload = z.object({ n: z.number() })
  const Ping = event({ payload: Payload })
  const Pong = event({ payload: Payload })
  const Reset = event({ payload: z.object({}) })
  const save = mutation({
    input: Payload,
    output: Payload,
    errors: { Busy: z.object({}) },
    invalidates: () => [],
  })
  const Context = z.object({ n: z.number(), log: z.array(z.number()) })
  const m = machine({
    context: Context,
    initialContext: { n: 0, log: [] },
    initial: 'a',
    states: ({ ctx }) => {
      const onA = [
        [0, on(Ping, { target: 'b', guard: (p) => op.gt(p.n, 1), assign: (p) => [op.set(ctx.n, p.n)] })],
        [1, on(Ping, { target: 'c', assign: (p) => [op.append(ctx.log, p.n)] })],
        [2, on(Pong, { target: 'c' })],
        [3, on(Reset, { target: 'a', assign: () => [op.set(ctx.n, 0)] })],
      ] as const
      const pings = onA.filter(([i]) => i < 2).map(([, d]) => d)
      const rest = shuffle(
        onA.filter(([i]) => i >= 2).map(([, d]) => d),
        rand,
      )
      const at = Math.floor(rand() * (rest.length + 1))
      const states = {
        a: { on: [...rest.slice(0, at), ...pings, ...rest.slice(at)] },
        b: {
          invoke: invoke(save, {
            input: { n: ctx.n },
            done: [{ target: 'a' }],
            failed: { Busy: [{ target: 'c' }], Unexpected: [{ target: 'c' }] },
          }),
        },
        c: {
          after: shuffle(
            [
              { ms: 20, target: 'a' as const },
              { ms: 10, target: 'b' as const },
            ],
            rand,
          ),
        },
      }
      return shuffleRecord(states, rand) as typeof states
    },
  })
  const Panel = ui.view({
    machine: m,
    render: ({ ctx, when }) =>
      ui.div({ class: 'p-2' }, [
        ctx.n,
        when(shuffle(['a', 'c'] as const, rand), [
          ui.button({ on: { click: ui.send(Reset, {}) } }, ['Reset']),
        ]),
      ]),
  })
  const f = feature({
    id: 'fresh',
    intent: { summary: 'Determinism fixture', invariants: [] },
    imports: [],
    tags: {},
    events: shuffleRecord({ Ping, Pong, Reset }, rand),
    queries: {},
    mutations: { save },
    fns: {},
    machine: m,
    views: { Panel },
    contracts: {},
    exports: {
      events: shuffle([Ping, Pong], rand),
      queries: [],
      mutations: [],
      tags: [],
      fns: [],
      views: [],
    },
  })
  return project({ schema: zodAdapter, session: null, routes: {}, features: [f] })
}

describe('A1 determinism', () => {
  it('builds the cart twice to the same hash', () => {
    const a = buildProject(cartProject)
    const b = buildProject(cartProject)
    expect(hashJson(a.ir)).toBe(hashJson(b.ir))
  })

  it('is independent of authoring order in the cart (1000 runs)', () => {
    const expected = hashJson(buildProject(cartProject).ir)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const result = buildProject(reorderCart(seeded(seed)))
        expect(result.diagnostics).toEqual([])
        expect(hashJson(result.ir)).toBe(expected)
      }),
      { numRuns: 1000 },
    )
  })

  it('is independent of identities, state order and cross-event transition order (1000 runs)', () => {
    const expected = hashJson(buildProject(freshProject(seeded(1))).ir)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const result = buildProject(freshProject(seeded(seed)))
        expect(result.diagnostics).toEqual([])
        expect(hashJson(result.ir)).toBe(expected)
      }),
      { numRuns: 1000 },
    )
  })
})
