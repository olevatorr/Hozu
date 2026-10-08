// @vitest-environment happy-dom
import { event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { listenKeys, pressed } from '@hozu/runtime-client'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { expect, it } from 'vitest'
import { z } from 'zod'

const Save = event({ payload: z.object({}) })
const m = machine({
  context: z.object({ saved: z.number() }),
  initialContext: { saved: 0 },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Save, {
      assign: () => {
        ctx.saved += 1
      },
    }),
  ],
  states: () => ({ idle: {} }),
})
const home = route({ path: '/', params: null, search: null })
const Editor = ui.view({
  machine: m,
  render: () =>
    ui.form({ on: { submit: ui.send(Save, {}) } }, [
      ui.input({ name: 'title', 'aria-label': 'Title' }),
      ui.button({ type: 'submit', keys: ['Mod+s'] }, ['Save']),
    ]),
})
const Header = ui.view({
  render: () => ui.header({}, [ui.input({ name: 'q', 'aria-label': 'Search', keys: ['/'] })]),
})
const app = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Header, Editor], head: { render: () => ({ title: 'Keys' }) } })],
  features: [feature({ id: 'k', intent: { summary: 'keys' }, declarations: [{ Save, m, Editor, Header }] })],
})
const build = buildProject(app, { sources: false })

it('keys on a control are written as aria-keyshortcuts, and the page loads the shortcut module (ADR 0073 B)', async () => {
  expect(build.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  const html = await (
    await createHandler({ build, resolvers: resolvers(app, () => []) }).fetch(new Request('http://x/'))
  ).text()
  expect(html).toContain('data-hozu-keys="/" aria-keyshortcuts="/"')
  expect(html).toContain('data-hozu-keys="Mod+s" aria-keyshortcuts="Control+S Meta+S"')
  expect(html).toMatch(/<script type="module" src="\/_hozu\/keys\.js\?v=\w+"><\/script><\/body>/)
})

it('a press focuses a field or clicks a control; printable keys wait while typing elsewhere', () => {
  document.body.innerHTML = `
    <input id="q" data-hozu-keys="/" aria-label="Search">
    <form id="f"><input id="t"><button id="s" type="submit" data-hozu-keys="Ctrl+s">Save</button></form>
    <button id="hidden" hidden data-hozu-keys="x">x</button>`
  let submitted = 0
  document.getElementById('f')!.addEventListener('submit', (e) => {
    e.preventDefault()
    submitted++
  })
  listenKeys(document)
  const press = (target: EventTarget, init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e.defaultPrevented
  }
  expect(press(document.body, { key: '/' })).toBe(true)
  expect(document.activeElement?.id).toBe('q')
  expect(press(document.getElementById('t')!, { key: '/' })).toBe(false)
  expect(press(document.getElementById('t')!, { key: 's', ctrlKey: true })).toBe(true)
  expect(submitted).toBe(1)
  expect(pressed(document, new KeyboardEvent('keydown', { key: 'x' }))).toBeNull()
})

it('ui.send takes no keys since 0.26: HZ014 names the control to move them to', () => {
  const Old = ui.view({
    machine: m,
    render: () =>
      ui.main({}, [ui.window({ on: { keydown: ui.send(Save, {}, { keys: ['Mod+s'] } as never) } })]),
  })
  const b = buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Old], head: { render: () => ({ title: 'x' }) } })],
      features: [feature({ id: 'o', intent: { summary: 'old' }, declarations: [{ Save, m, Old }] })],
    }),
    { sources: false },
  )
  expect(b.diagnostics.find((d) => d.code === 'HZ014')?.message).toBe('ui.send takes no keys since 0.26')
})

it('two controls always shown together cannot share a shortcut', () => {
  const Twice = ui.view({
    render: () =>
      ui.main({}, [
        ui.input({ name: 'a', 'aria-label': 'A', keys: ['/'] }),
        ui.input({ name: 'b', 'aria-label': 'B', keys: ['/'] }),
      ]),
  })
  const b = buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Twice], head: { render: () => ({ title: 'x' }) } })],
      features: [feature({ id: 't', intent: { summary: 'twice' }, declarations: [{ Twice }] })],
    }),
    { sources: false },
  )
  expect(b.diagnostics.find((d) => d.code === 'HZ014')?.message).toBe(
    'Two controls of this view both take the shortcut /',
  )
})

it('ui.use passes keys to a component whose root is a control, and refuses one that is not', async () => {
  const { tv } = await import('@hozu/variants')
  const Button = ui.component({
    tag: 'button',
    styles: tv({ base: 'px-2' }),
    children: true,
    render: ({ children }) => ui.button({ type: 'button' }, children),
  })
  const Card = ui.component({
    tag: 'div',
    styles: tv({ base: 'p-2' }),
    children: true,
    render: ({ children }) => ui.div({}, children),
  })
  const View = ui.view({
    render: () =>
      ui.main({}, [
        ui.use(Button, { keys: ['Mod+k'] }, ['Open']),
        ui.use(Card, { keys: ['x'] } as never, ['Card']),
      ]),
  })
  const b = buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      kits: [ui.kit({ id: 'ui', components: [{ Button, Card }] })],
      pages: [ui.page(home, { views: [View], head: { render: () => ({ title: 'x' }) } })],
      features: [feature({ id: 'u', intent: { summary: 'use' }, declarations: [{ View }] })],
    }),
    { sources: false },
  )
  expect(b.diagnostics.map((d) => `${d.code} ${d.message}`)).toContain(
    'HZ014 ui.Card renders a <div>, which a shortcut cannot press',
  )
  const root = b.ir.features.u!.views.View!.root as { children: { attrs?: Record<string, unknown> }[] }
  expect(root.children[0]!.attrs?.['aria-keyshortcuts']).toEqual({ literal: 'Control+K Meta+K' })
})
