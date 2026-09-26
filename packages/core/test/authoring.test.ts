import { contract, event, feature, invoke, machine, mutation, on, op, project } from '@tenonkit/core'
import { buildProject } from '@tenonkit/core/ir'
import { zodAdapter } from '@tenonkit/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const SetN = event({ payload: z.object({ n: z.number() }) })
const save = mutation({ input: z.object({ n: z.number() }), output: z.object({}) })
const m = machine({
  context: z.object({
    n: z.number(),
    meta: z.object({ label: z.string(), seen: z.number() }),
    tags: z.array(z.string()),
  }),
  initialContext: { n: 0, meta: { label: 'a', seen: 0 }, tags: ['x'] },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(SetN, { target: 'saving', assign: (e) => [op.set(ctx.n, e.n)] })] },
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
      features: [feature({ id: 'f', intent: { summary: 'fixture' }, declarations: declarations as never })],
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

  it('reports a second machine as TN013 and a non-declaration as TN014', () => {
    const codes = (d: Record<string, unknown>) => build(d).diagnostics.map((x) => x.code)
    expect(codes({ SetN, save, m, again: m })).toContain('TN013')
    expect(codes({ SetN, save, m, helper: () => 1 })).toContain('TN014')
  })
})
