import { contract, event, feature, machine, on, project, query, tag, ui } from '@hozu/core'
import { buildProject, type ProjectIR } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { stateSplit } from '../src/walk.ts'

const Pause = event({ payload: z.object({}) })
const RefreshNow = event({ payload: z.object({}) })
const Copy = event({ payload: z.object({ text: z.string() }) })
const quotesTag = tag({ param: null })
const m = machine({
  context: z.object({}),
  initialContext: {},
  initial: 'live',
  on: () => [on(RefreshNow, { refresh: () => [quotesTag()] }), on(Copy, { copy: (e) => `${e.text}!` })],
  states: () => ({
    live: {
      on: [on(Pause, { target: 'paused' })],
      after: [{ ms: 1000, target: 'live', refresh: () => [quotesTag()] }],
    },
    paused: { on: [on(Pause, { target: 'live' })] },
  }),
})
const copies = contract(m, {
  given: { state: 'live' },
  when: [{ send: Copy, payload: { text: 'AAPL' } }],
  expect: { state: 'live', effects: [{ copy: 'AAPL!' }] },
})
const View = ui.view({
  machine: m,
  render: ({ is }) => ui.button({ type: 'button', disabled: is(['paused']) }, ['Refresh']),
})
const build = (extra: object = {}) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: {},
      pages: [],
      features: [
        feature({
          id: 'w',
          intent: { summary: 'ADR 0064' },
          declarations: [{ Pause, RefreshNow, Copy, quotesTag, m, copies, View, ...extra }],
        }),
      ],
    }),
    { sources: true },
  )
const b = build()
const check = (ir: ProjectIR) => verify(ir, { sources: b.sources, bindings: b.bindings })

describe('ADR 0064: refresh, copy and is()', () => {
  it('checks clean; a computed copy is a decision its contract covers, and the lock prints both effects', () => {
    expect(b.diagnostics).toEqual([])
    const { diagnostics, lock } = check(structuredClone(b.ir))
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const entries = lock!.features.w!
    expect(entries['live/after/0']!.summary).toBe(
      'live --after 1000ms--> live · refresh quotesTag · after 1000ms',
    )
    expect(entries['live/after/0']!.decides).toBe(false)
    expect(entries['live/on/w.Copy/0']!.decides).toBe(true)
    expect(entries['live/on/w.Copy/0']!.summary).toContain('copy')
  })

  it('a contract expects a refresh, and HZ016 suggests it', () => {
    const refreshes = contract(m, {
      given: { state: 'live' },
      when: [{ send: RefreshNow, payload: {} }],
      expect: { state: 'live', effects: [{ refresh: [quotesTag()] }] },
    })
    const withRefresh = build({ refreshes })
    expect(withRefresh.ir.features.w!.contracts.refreshes!.expect.effects).toEqual([
      { refresh: ['w.quotesTag'] },
    ])
    const ir = structuredClone(b.ir)
    ir.features.w!.machine!.states.paused!.on['w.Pause'] = [
      {
        guard: { op: 'eq', left: { literal: 1 }, right: { literal: 1 } },
        target: 'live',
        assign: [],
        navigate: null,
        refresh: [{ tag: 'w.quotesTag', param: null }],
      },
    ]
    const d = check(ir).diagnostics.find((x) => x.code === 'HZ016')!
    expect(d.fix?.snippet).toContain('effects: [{ refresh: [quotesTag()] }]')
  })

  it('is([...]) reads the machine state; an unknown state is HZ007', () => {
    const button = b.ir.features.w!.views.View!.root as { attrs: Record<string, unknown> }
    expect(button.attrs.disabled).toEqual({
      test: { op: 'eq', left: { ref: 'state', path: [] }, right: { literal: 'paused' } },
    })
    const Bad = ui.view({ machine: m, render: ({ is }) => ui.p({ hidden: is(['gone' as 'live']) }, ['x']) })
    const bad = build({ Bad })
    expect(bad.diagnostics.map((d) => d.message)).toContain('Unknown state "gone" in is([...])')
  })

  it('a native dialog, popover and details need no machine and check clean (the views topic)', () => {
    const Menus = ui.view({
      render: () =>
        ui.div({}, [
          ui.button({ type: 'button', commandfor: 'd', command: 'show-modal' }, ['Open']),
          ui.dialog({ id: 'd', closedby: 'any' }, [ui.p({}, ['Hello'])]),
          ui.button({ type: 'button', popovertarget: 'menu' }, ['Menu']),
          ui.div({ id: 'menu', popover: 'auto' }, [ui.p({}, ['Item'])]),
          ui.details({}, [ui.summary({}, ['More']), ui.p({}, ['Text'])]),
        ]),
    })
    const built = build({ Menus })
    expect(built.diagnostics).toEqual([])
    const found = verify(built.ir, { sources: built.sources, bindings: built.bindings }).diagnostics
    expect(found.filter((d) => d.location.pointer.includes('/views/Menus/'))).toEqual([])
  })

  it('HZ019 when a refresh names a tag no query carries, or only server-cached queries carry', () => {
    const cachedQueryDef = {
      input: z.object({}),
      output: z.array(z.string()),
      scope: 'public',
      freshness: 'static',
      tags: () => [quotesTag()],
      runs: 'server',
    } as const
    const cachedQuery = query(cachedQueryDef)
    const hz019 = (extra: object) => {
      const built = build(extra)
      return verify(built.ir, { sources: built.sources, bindings: built.bindings })
        .diagnostics.filter((d) => d.code === 'HZ019')
        .map((d) => d.message)
    }
    expect(hz019({})).toEqual([
      'refresh names w.quotesTag, but no query carries that tag',
      'refresh names w.quotesTag, but no query carries that tag',
    ])
    expect(hz019({ cachedQuery })[0]).toBe(
      'refresh names w.quotesTag, but every query with that tag is cached on the server, so it answers the same data',
    )
    const requestQuery = query({ ...cachedQueryDef, freshness: 'request' })
    expect(hz019({ requestQuery })).toEqual([])
  })

  it('a copy stays in live, so the refresh timer keeps its time (ADR 0064 F)', () => {
    const keepsTimer = contract(m, {
      given: { state: 'live' },
      when: [{ elapse: 600 }, { send: Copy, payload: { text: 'A' } }, { elapse: 600 }],
      expect: { state: 'live', effects: [{ copy: 'A!' }, { refresh: [quotesTag()] }] },
    })
    const built = build({ keepsTimer })
    const found = verify(built.ir, { sources: built.sources, bindings: built.bindings }).diagnostics
    expect(found.filter((d) => d.code === 'HZ015')).toEqual([])
    expect(found.find((d) => d.code === 'HZ057')).toBeUndefined()
  })

  it('is([...]) works for structure: ?: and && become conditions HZ005 reads by state (ADR 0067 F)', () => {
    const Toolbar = ui.view({
      machine: m,
      render: ({ is }) =>
        ui.div({}, [
          is(['paused'])
            ? ui.button({ type: 'button', on: { click: ui.send(Pause, {}) } }, ['Resume'])
            : ui.button({ type: 'button', disabled: !is(['live']), on: { click: ui.send(Pause, {}) } }, [
                'Pause',
              ]),
          !is(['paused']) && ui.p({}, ['Live']),
        ]),
    })
    const built = build({ Toolbar })
    expect(built.diagnostics).toEqual([])
    const root = built.ir.features.w!.views.Toolbar!.root as unknown as {
      children: Record<string, unknown>[]
    }
    expect(root.children[0]).toMatchObject({
      kind: 'if',
      test: { op: 'eq', left: { ref: 'state', path: [] }, right: { literal: 'paused' } },
    })
    expect(root.children[1]).toMatchObject({ kind: 'if', test: { op: 'not' } })
    const pause = (root.children[0] as { ifFalse: { attrs: Record<string, unknown> }[] }).ifFalse[0]!
    expect(pause.attrs.disabled).toEqual({
      test: { op: 'not', arg: { op: 'eq', left: { ref: 'state', path: [] }, right: { literal: 'live' } } },
    })
    const found = verify(built.ir, { sources: built.sources, bindings: built.bindings }).diagnostics
    expect(found.filter((d) => d.code === 'HZ005')).toEqual([])
  })

  it('reads the states a condition allows, for HZ005 (ADR 0067 F)', () => {
    const all = ['live', 'paused', 'adding']
    const is = (s: string) => ({
      op: 'eq' as const,
      left: { ref: 'state' as const, path: [] },
      right: { literal: s },
    })
    const ctx = {
      op: 'fn' as const,
      fn: '%truthy',
      arg: { object: { v: { ref: 'context' as const, path: ['x'] } } },
    }
    const sets = (g: Parameters<typeof stateSplit>[0]) => {
      const r = stateSplit(g, all)
      return [r.yes && [...r.yes], r.no && [...r.no]]
    }
    expect(sets(is('paused'))).toEqual([['paused'], ['live', 'adding']])
    expect(sets({ op: 'not', arg: is('paused') })).toEqual([['live', 'adding'], ['paused']])
    expect(sets({ op: 'or', args: [is('live'), is('adding')] })).toEqual([['live', 'adding'], ['paused']])
    expect(sets({ op: 'and', args: [is('live'), ctx] })).toEqual([['live'], null])
    expect(sets(ctx)).toEqual([null, null])
  })
})
