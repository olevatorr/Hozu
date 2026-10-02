import { contract, event, feature, invoke, machine, mutation, on, project } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const SetN = event({ payload: z.object({ n: z.number() }) })
const save = mutation({ input: z.object({ n: z.number() }), output: z.object({}), runs: 'server' })
const m = machine({
  context: z.object({
    n: z.number(),
    meta: z.object({ label: z.string(), seen: z.number() }),
    tags: z.array(z.string()),
  }),
  initialContext: { n: 0, meta: { label: 'a', seen: 0 }, tags: ['x'] },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetN, {
          target: 'saving',
          assign: (e) => {
            ctx.n = e.n
          },
        }),
      ],
    },
    saving: {
      invoke: invoke(save, {
        input: { n: ctx.n },
        done: [{ target: 'idle' }],
        failed: { Unexpected: [{ target: 'idle' }] },
      }),
    },
  }),
})

const build = (declarations: Record<string, unknown>) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: {},
      pages: [],
      features: [feature({ id: 'f', intent: { summary: 'fixture' }, declarations: [declarations] })],
    }),
  )

describe('contracts state only what changes', () => {
  it('defaults the given context to the initial context and merges changes deeply', () => {
    const c = contract(m, {
      given: { state: 'idle' },
      when: [{ send: SetN, payload: { n: 2 } }],
      expect: { state: 'saving', changes: { n: 2, meta: { seen: 1 }, tags: ['y'] } },
    })
    const ir = build({ SetN, save, m, c }).ir.features.f!.contracts.c!
    expect(ir.given.context).toEqual({ n: 0, meta: { label: 'a', seen: 0 }, tags: ['x'] })
    expect(ir.expect.context).toEqual({ n: 2, meta: { label: 'a', seen: 1 }, tags: ['y'] })
    expect(ir.expect.effects).toEqual([])
  })

  it('reads a partial given context as a patch over the initial context', () => {
    const c = contract(m, {
      given: { state: 'idle', context: { meta: { seen: 3 } } },
      when: [{ send: SetN, payload: { n: 2 } }],
      expect: { state: 'saving', changes: { n: 2 } },
    })
    const ir = build({ SetN, save, m, c }).ir.features.f!.contracts.c!
    expect(ir.given.context).toEqual({ n: 0, meta: { label: 'a', seen: 3 }, tags: ['x'] })
    expect(ir.expect.context).toEqual({ n: 2, meta: { label: 'a', seen: 3 }, tags: ['x'] })
  })

  it('expects an unchanged context and no effects when both are omitted', () => {
    const c = contract(m, {
      given: { state: 'idle', context: { n: 5, meta: { label: 'b', seen: 2 }, tags: [] } },
      when: [],
      expect: { state: 'idle' },
    })
    const ir = build({ SetN, save, m, c }).ir.features.f!.contracts.c!
    expect(ir.expect.context).toEqual(ir.given.context)
    expect(ir.expect.effects).toEqual([])
  })
})

describe('declarations are classified by kind', () => {
  it('sorts each declaration into its kind', () => {
    const f = build({ SetN, save, m }).ir.features.f!
    expect(Object.keys(f.events)).toEqual(['SetN'])
    expect(Object.keys(f.mutations)).toEqual(['save'])
    expect(f.machine).not.toBeNull()
  })

  it('reports a second machine and a name two modules declare as HZ013, and ignores other exports', () => {
    const codes = (d: Record<string, unknown>) => build(d).diagnostics.map((x) => x.code)
    expect(codes({ SetN, save, m, again: m })).toContain('HZ013')
    expect(codes({ SetN, save, m, helper: () => 1, Schema: z.object({}) })).toEqual([])
    const twice = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [
          feature({
            id: 'f',
            intent: { summary: 'x' },
            declarations: [{ SetN, save, m }, { SetN: event({ payload: z.object({}) }) }],
          }),
        ],
      }),
    )
    expect(twice.diagnostics.map((d) => d.message)).toContain(
      '"SetN" is declared by two of the feature\'s modules',
    )
  })

  it('reports the record form as HZ014 with the module form as its fix', () => {
    const old = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', intent: { summary: 'x' }, declarations: { SetN } as never })],
      }),
    )
    const d = old.diagnostics.find((x) => x.code === 'HZ014')!
    expect(d.message).toBe('declarations is a list of modules')
    expect(d.fix?.snippet).toBe('declarations: [model, views]')
  })
})

describe('machine-wide transitions (ADR 0041 D)', () => {
  const Search = event({ payload: z.object({ q: z.string() }) })
  const Pause = event({ payload: z.object({}) })
  const shared = machine({
    context: z.object({ q: z.string(), n: z.number() }),
    initialContext: { q: '', n: 0 },
    initial: 'idle',
    on: ({ ctx }) => [
      on(Search, {
        assign: (e) => {
          ctx.q = e.q
        },
      }),
      on(Pause, { target: 'idle' }),
    ],
    states: ({ ctx }) => ({
      idle: { ignore: [Pause] },
      touring: {
        after: [
          {
            ms: 1000,
            target: 'touring',
            assign: () => {
              ctx.n += 1
            },
          },
        ],
      },
      editing: { on: [on(Search, { target: 'idle' })] },
      saving: {
        invoke: invoke(save, { input: { n: ctx.n }, done: 'idle', failed: { Unexpected: 'idle' } }),
      },
    }),
  })

  it('copies each shared transition into every state that is not busy and does not handle or ignore it', () => {
    const states = build({ Search, Pause, save, shared }).ir.features.f!.machine!.states
    expect(states.idle!.on['f.Search']![0]!.target).toBe('idle')
    expect(states.touring!.on['f.Search']![0]!.target).toBe('touring')
    expect(states.touring!.on['f.Search']![0]!.assign).toEqual(states.idle!.on['f.Search']![0]!.assign)
    expect(states.editing!.on['f.Search']![0]!.assign).toEqual([])
    expect(states.idle!.on['f.Pause']).toBeUndefined()
    expect(states.touring!.on['f.Pause']![0]!.target).toBe('idle')
    expect(states.saving!.on).toEqual({})
  })

  it("reports a state's transition without a target", () => {
    const loose = machine({
      context: z.object({ q: z.string() }),
      initialContext: { q: '' },
      initial: 'idle',
      states: () => ({ idle: { on: [on(Search, {})] } }),
    })
    const d = build({ Search, loose }).diagnostics.find((x) => x.code === 'HZ014')!
    expect(d.message).toBe('This transition has no target')
  })
})
