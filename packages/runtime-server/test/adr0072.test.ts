// @vitest-environment happy-dom
import { event, feature, machine, on, project, ui } from '@hozu/core'
import { buildProject, type ViewNode } from '@hozu/core/ir'
import { compileMachine } from '@hozu/machine'
import { extras, mount } from '@hozu/runtime-client'
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

const Open = event({ payload: z.object({}) })
const Find = event({ payload: z.object({}) })
const k = machine({
  context: z.object({ opened: z.number(), found: z.number() }),
  initialContext: { opened: 0, found: 0 },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Open, {
      assign: () => {
        ctx.opened += 1
      },
    }),
    on(Find, {
      assign: () => {
        ctx.found += 1
      },
    }),
  ],
  states: () => ({ idle: {} }),
})
const Keys = ui.view({
  machine: k,
  render: () =>
    ui.main({}, [
      ui.window({ on: { keydown: ui.send(Open, {}, { keys: ['Ctrl+k', '/'] }) } }),
      ui.input({ name: 'q', on: { keydown: ui.send(Find, {}, { keys: ['Enter'] }) } }),
    ]),
})
const keyed = (view: unknown) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: {},
      pages: [],
      features: [feature({ id: 'k', intent: { summary: 'keys' }, declarations: [{ Open, Find, k, view }] })],
    }),
  )

it('a send with keys fires only on those presses, stops the browser shortcut, and lets fields type (ADR 0072 B)', () => {
  const b = keyed(Keys)
  expect(b.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  const root = document.createElement('div')
  document.body.append(root)
  const app = mount(root, {
    view: b.ir.features.k!.views.view!,
    machine: compileMachine(b.ir.features.k!, b.bindings.fns),
    payload: new Map(),
    fns: b.bindings.fns,
    extras,
  })
  const press = (target: EventTarget, init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e.defaultPrevented
  }
  expect(press(window, { key: 'k', ctrlKey: true })).toBe(true)
  expect(press(window, { key: 'k' })).toBe(false)
  expect(press(window, { key: 'K', ctrlKey: true, shiftKey: true })).toBe(false)
  expect(press(document.body, { key: '/' })).toBe(true)
  const input = root.querySelector('input')!
  expect(press(input, { key: '/' })).toBe(false)
  expect(press(input, { key: 'Enter' })).toBe(true)
  expect(app.snapshot()!.context).toEqual({ opened: 2, found: 1 })
})

it('a bad shortcut is HZ014 at record time', () => {
  const Bad = ui.view({
    machine: k,
    render: () =>
      ui.main({ on: { click: ui.send(Open, {}, { keys: ['Mod+k'] }) } }, [
        ui.input({ name: 'q', on: { keydown: ui.send(Find, {}, { keys: ['Hyper+x', 'Ctrl+Ctrl+a'] }) } }),
      ]),
  })
  const messages = keyed(Bad)
    .diagnostics.filter((d) => d.code === 'HZ014')
    .map((d) => d.message)
  expect(messages).toEqual(['keys work on keydown and keyup, not on click', '"Hyper+x" is not a shortcut'])
})
