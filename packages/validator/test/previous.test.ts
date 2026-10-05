import { contract, event, feature, machine, on, project, ui } from '@hozu/core'
import { buildProject, type ProjectIR } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Pause = event({ payload: z.object({}) })
const Edit = event({ payload: z.object({}) })
const Done = event({ payload: z.object({ ok: z.boolean() }) })
const m = machine({
  context: z.object({}),
  initialContext: {},
  initial: 'running',
  states: () => ({
    running: { on: [on(Pause, { target: 'paused' }), on(Edit, { target: 'editing' })] },
    paused: { on: [on(Pause, { target: 'running' }), on(Edit, { target: 'editing' })] },
    editing: { on: [on(Done, { target: 'previous', guard: (e) => e.ok === true })] },
  }),
})
const backToPaused = contract(m, {
  given: { state: 'editing', previous: 'paused' },
  when: [{ send: Done, payload: { ok: true } }],
  expect: { state: 'paused' },
})
const View = ui.view({ machine: m, render: () => ui.p({}, ['x']) })
const build = buildProject(
  project({
    schema: zodAdapter,
    routes: {},
    pages: [],
    features: [
      feature({
        id: 'w',
        intent: { summary: "target: 'previous'" },
        declarations: [{ Pause, Edit, Done, m, backToPaused, View }],
      }),
    ],
  }),
  { sources: true },
)
const check = (ir: ProjectIR) => verify(ir, { sources: build.sources, bindings: build.bindings })
const errors = (ir: ProjectIR) => check(ir).diagnostics.filter((d) => d.severity === 'error')
const fresh = () => structuredClone(build.ir)

describe("ADR 0063 C2: target: 'previous'", () => {
  it('records the target, and a contract starts from a given previous state', () => {
    expect(build.diagnostics).toEqual([])
    expect(build.ir.features.w!.machine!.states.editing!.on['w.Done']![0]!.target).toBe('previous')
    expect(build.ir.features.w!.contracts.backToPaused!.given.previous).toBe('paused')
    expect(errors(fresh())).toEqual([])
  })

  it('a contract without the previous state does not leave editing', () => {
    const ir = fresh()
    delete ir.features.w!.contracts.backToPaused!.given.previous
    expect(errors(ir).map((d) => d.code)).toContain('HZ015')
  })

  it('HZ007 when no transition enters the state from another one', () => {
    const ir = fresh()
    ir.features.w!.machine!.states.paused!.on['w.Pause']![0]!.target = 'paused'
    ir.features.w!.machine!.states.running!.on['w.Done'] = [
      { target: 'previous', guard: null, assign: [], navigate: null },
    ]
    const d = errors(ir).find((x) => x.code === 'HZ007')!
    expect(d.message).toBe('"running" has no previous state to return to')
    expect(d.location.pointer).toBe('/features/w/machine/states/running/on/w.Done/0/target')
  })

  it('HZ016 suggests a contract with a previous state', () => {
    const ir = fresh()
    ir.features.w!.contracts = {}
    const d = errors(ir).find((x) => x.code === 'HZ016')!
    expect(d.fix?.snippet).toContain("given: { state: 'editing', previous: 'running' }")
    expect(d.fix?.snippet).toContain("expect: { state: 'running' }")
  })

  it('reserves the state name', () => {
    const named = machine({
      context: z.object({}),
      initialContext: {},
      initial: 'previous',
      states: () => ({ previous: { final: true } }),
    })
    const b = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'n', intent: { summary: 'x' }, declarations: [{ named }] })],
      }),
    )
    expect(b.diagnostics.map((d) => d.message)).toContain('A state cannot be named "previous"')
  })
})
