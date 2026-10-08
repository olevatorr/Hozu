// @vitest-environment happy-dom
import { event, feature, fn, machine, on, project, route, ui } from '@hozu/core'
import { buildProject, type ViewNode } from '@hozu/core/ir'
import { compileMachine } from '@hozu/machine'
import { mount } from '@hozu/runtime-client'
import { zodAdapter } from '@hozu/schema-zod'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { renderBuild, sharedElement } from '../src/shared.ts'

const Pause = event({ payload: z.object({}) })
const Resume = event({ payload: z.object({}) })
const m = machine({
  context: z.object({ paused: z.boolean(), n: z.number() }),
  initialContext: { paused: false, n: 1 },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Pause, {
      assign: () => {
        ctx.paused = true
      },
    }),
    on(Resume, {
      assign: () => {
        ctx.paused = false
      },
    }),
  ],
  states: () => ({ idle: {} }),
})
const Board = ui.view({
  machine: m,
  render: ({ ctx }) =>
    ui.main({}, [
      ctx.paused
        ? ui.button({ type: 'button', class: 'px-2 text-green-700', on: { click: ui.send(Resume, {}) } }, [
            'Resume',
          ])
        : ui.button(
            { type: 'button', class: 'px-2', title: 'Stop updates', on: { click: ui.send(Pause, {}) } },
            ['Pause'],
          ),
      ctx.paused ? ui.p({}, ['Paused']) : ui.span({}, ['Live']),
      ctx.paused ? ui.input({ name: 'a' }) : ui.input({ name: 'b' }),
      ctx.paused ? [ui.b({}, ['a']), ui.b({}, ['b'])] : ui.b({}, ['c']),
    ]),
})
const raw = buildProject(
  project({
    schema: zodAdapter,
    routes: {},
    pages: [],
    features: [
      feature({ id: 'w', intent: { summary: 'watch' }, declarations: [{ Pause, Resume, m, Board }] }),
    ],
  }),
)

it('merges the branches of c ? a : b that share a shape, and only those (ADR 0072 A)', () => {
  const kids = (raw.ir.features.w!.views.Board!.root as Extract<ViewNode, { kind: 'el' }>).children
  const ifs = kids.filter((k): k is Extract<ViewNode, { kind: 'if' }> => k.kind === 'if')
  expect(ifs.map((n) => sharedElement(n)?.tag ?? null)).toEqual(['button', null, null, null])
  const one = sharedElement(ifs[0]!)!
  expect(one.class).toBe('px-2')
  expect(Object.keys(one.toggle)).toEqual(['text-green-700'])
  expect(one.attrs.title).toMatchObject({ fn: '%cond' })
  expect(one.on.click).toMatchObject({ a: { event: 'w.Resume' }, b: { event: 'w.Pause' } })
  const built = renderBuild(raw)
  expect(renderBuild(built)).toBe(built)
  expect(built.bindings.fns['%cond']).toBeTypeOf('function')
  expect(raw.ir.features.w!.views.Board!.root).toBe(raw.ir.features.w!.views.Board!.root)
})

it('the merged element is kept: text, class, attributes and the listener follow the condition', () => {
  const b = renderBuild(raw)
  const root = document.createElement('div')
  document.body.append(root)
  mount(root, {
    view: b.ir.features.w!.views.Board!,
    machine: compileMachine(b.ir.features.w!, b.bindings.fns),
    payload: new Map(),
    fns: b.bindings.fns,
  })
  const button = root.querySelector('button')!
  expect(button.textContent).toBe('Pause')
  expect(button.getAttribute('title')).toBe('Stop updates')
  button.focus()
  button.click()
  expect(root.querySelector('button')).toBe(button)
  expect(button.textContent).toBe('Resume')
  expect(button.getAttribute('class')).toBe('px-2 text-green-700')
  expect(button.hasAttribute('title')).toBe(false)
  expect(document.activeElement).toBe(button)
  button.click()
  expect(button.textContent).toBe('Pause')
  expect(button.getAttribute('class')).toBe('px-2')
})

it('branches that compute from data the other side hides, or link elsewhere, are not merged', () => {
  const Picked = event({ payload: z.object({ name: z.string().nullable() }) })
  const p = machine({
    context: z.object({ picked: z.string().nullable() }),
    initialContext: { picked: null },
    initial: 'idle',
    on: ({ ctx }) => [
      on(Picked, {
        assign: (e) => {
          ctx.picked = e.name
        },
      }),
    ],
    states: () => ({ idle: {} }),
  })
  const shout = fn({ input: z.string(), output: z.string(), impl: (s) => s.toUpperCase() })
  const there = route({ path: '/there', params: null, search: null })
  const here = route({ path: '/', params: null, search: null })
  const View = ui.view({
    machine: p,
    render: ({ ctx }) =>
      ui.main({}, [
        ctx.picked !== null ? ui.h2({}, [shout(ctx.picked)]) : ui.h2({}, ['Pick one']),
        ctx.picked !== null
          ? ui.a({ href: ui.link(there, null) }, ['There'])
          : ui.a({ href: ui.link(here, null) }, ['Here']),
      ]),
  })
  const b = buildProject(
    project({
      schema: zodAdapter,
      routes: { here, there },
      pages: [],
      features: [
        feature({ id: 'p', intent: { summary: 'pick' }, declarations: [{ Picked, p, shout, View }] }),
      ],
    }),
  )
  expect(b.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  const kids = (b.ir.features.p!.views.View!.root as Extract<ViewNode, { kind: 'el' }>).children
  expect(kids.map((k) => (k.kind === 'if' ? sharedElement(k) : 'not an if'))).toEqual([null, null])
})
