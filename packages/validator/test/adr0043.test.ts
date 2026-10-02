import { contract, event, feature, fn, invoke, machine, mutation, on, project, route, ui } from '@hozu/core'
import { buildProject, type ProjectIR } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: z.object({ tag: z.string().default('') }) })
const item = route({ path: '/items/:id', params: z.object({ id: z.string() }), search: null })
const Go = event({ payload: z.object({}) })
const Open = event({ payload: z.object({ id: z.string() }) })
const Save = event({ payload: z.object({}) })
const slug = fn({
  input: z.object({ id: z.string() }),
  output: z.string(),
  impl: ({ id }) => id.toLowerCase(),
})
const save = mutation({
  input: z.object({}),
  output: z.object({}),
  errors: { Busy: z.object({}) },
  runs: 'server',
})
const m = machine({
  context: z.object({ note: z.string() }),
  initialContext: { note: '' },
  initial: 'idle',
  states: () => ({
    idle: {
      on: [
        on(Go, { target: 'idle', navigate: () => ui.link(home, null) }),
        on(Open, { target: 'idle', navigate: (e) => ui.link(item, { id: slug({ id: e.id }) }) }),
        on(Save, { target: 'saving' }),
      ],
    },
    saving: {
      invoke: invoke(save, { input: {}, done: 'idle', failed: { Busy: 'idle', Unexpected: 'idle' } }),
    },
  }),
})
const goes = contract(m, {
  given: { state: 'idle' },
  when: [{ send: Go, payload: {} }],
  expect: { state: 'idle', effects: [{ navigate: '/' }] },
})
const opens = contract(m, {
  given: { state: 'idle' },
  when: [{ send: Open, payload: { id: 'A' } }],
  expect: { state: 'idle', effects: [{ navigate: '/items/a' }] },
})
const View = ui.view({ machine: m, render: () => ui.p({}, ['x']) })
const head = { render: () => ({ title: 'x' }) }
const p = project({
  schema: zodAdapter,
  routes: { home, item },
  pages: [ui.page(home, { views: [View], head }), ui.page(item, { views: [View], head })],
  features: [
    feature({
      id: 'f',
      intent: { summary: 'ADR 0043 lock repro' },
      declarations: [{ Go, Open, Save, slug, save, m, goes, opens, View }],
    }),
  ],
})
const build = buildProject(p, { sources: true })
const check = (ir: ProjectIR, lock = baseline) =>
  verify(ir, { sources: build.sources, bindings: build.bindings, lock })
const baseline = verify(build.ir, { sources: build.sources, bindings: build.bindings }).lock
const fresh = () => structuredClone(build.ir)
const f = (ir: ProjectIR) => ir.features.f!
const states = (ir: ProjectIR) => f(ir).machine!.states
const pointer = (id: string) => `/features/f/machine/states/${id}`

describe('ADR 0043 G (lock)', () => {
  it('the fixture checks clean against its own lock', () => {
    expect(build.diagnostics).toEqual([])
    expect(check(fresh()).diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('ADR 0043 D1: no HZ018 prints identical was/now after ui.link(home, null) becomes {}', () => {
    const ir = fresh()
    const go = states(ir).idle!.on['f.Go']![0]!
    const link = go.navigate as object
    go.navigate = { ...link, search: { object: {} } } as never
    expect(check(ir).diagnostics.filter((d) => ['HZ018', 'HZ057'].includes(d.code))).toEqual([])
    go.navigate = { ...link, search: { object: { tag: { literal: 'x' } } } } as never
    const [changed] = check(ir).diagnostics.filter((d) => d.code === 'HZ018')
    const [was, now] = ['was', 'now'].map((k) =>
      changed!.cause.split('\n').find((l) => l.startsWith(`${k}: `)),
    )
    expect(changed!.message).toContain('(navigate)')
    expect(now).toContain('navigate link(home, null, { tag: "x" })')
    expect(was).not.toBe(now?.replace('now: ', 'was: '))
  })

  it('ADR 0043 D6: a new failed branch does not flag the transition entering the invoke', () => {
    const ir = fresh()
    f(ir).mutations.save!.errors.Gone = f(ir).mutations.save!.errors.Busy!
    const invoked = states(ir).saving!.invoke!
    invoked.failed.Gone = structuredClone(invoked.failed.Busy!)
    const { diagnostics } = check(ir)
    const flagged = diagnostics.filter(
      (d) => d.code === 'HZ018' && d.location.pointer === pointer('idle/on/f.Save/0'),
    )
    expect(flagged.map((d) => d.cause)).toEqual([])
    const stale = diagnostics.filter((d) => d.code === 'HZ057').flatMap((d) => d.cause.split('\n').slice(1))
    expect(stale).toEqual(['new saving/invoke/failed/Gone/0 · now: saving --failed save.Gone--> idle'])
  })

  it('ADR 0043 R4: a new transition missing from the lock is reported', () => {
    const ir = fresh()
    f(ir).events.Note = structuredClone(f(ir).events.Go!)
    states(ir).idle!.on['f.Note'] = [
      {
        guard: null,
        target: 'idle',
        assign: [{ op: 'set', path: ['note'], value: { literal: 'x' } }],
        navigate: null,
      },
    ] as never
    const stale = check(ir).diagnostics.filter((d) => d.code === 'HZ057')
    expect(stale.map((d) => [d.severity, d.location.pointer])).toEqual([['error', pointer('idle')]])
    expect(stale[0]!.cause).toContain('new idle/on/f.Note/0 · now: idle --Note--> idle · note := "x"')
  })

  it('ADR 0043 R5: a fn used in navigate is part of the behaviour hash', () => {
    const ir = fresh()
    f(ir).fns.slug!.sourceHash = 'changed'
    const behavior = (lock: typeof baseline) => lock!.features.f!['idle/on/f.Open/0']!.behavior
    expect(behavior(check(ir).lock)).not.toBe(behavior(baseline))
  })
})
