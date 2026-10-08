// @vitest-environment happy-dom
import { event, feature, machine, on, project, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { compileMachine } from '@hozu/machine'
import { mount } from '@hozu/runtime-client'
import { zodAdapter } from '@hozu/schema-zod'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'

const Edit = event({ payload: z.object({}) })
const Done = event({ payload: z.object({}) })
const m = machine({
  context: z.object({}),
  initialContext: {},
  initial: 'idle',
  states: () => ({
    idle: { on: [on(Edit, { target: 'editing' })] },
    editing: { on: [on(Done, { target: 'idle' })] },
  }),
})
const Board = ui.view({
  machine: m,
  render: ({ is }) =>
    ui.main({}, [
      ui.button({ type: 'button', on: { click: ui.send(Edit, {}) } }, ['Edit']),
      ui.dialog({ open: is(['editing']), on: { close: ui.send(Done, {}) } }, [ui.p({}, ['Form'])]),
    ]),
})
const b = buildProject(
  project({
    schema: zodAdapter,
    routes: {},
    pages: [],
    features: [feature({ id: 'd', intent: { summary: 'dialog' }, declarations: [{ Edit, Done, m, Board }] })],
  }),
)

it('a dialog whose open follows the machine opens as a modal and closes (ADR 0069 B3)', async () => {
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  const root = document.createElement('div')
  document.body.append(root)
  const app = mount(root, {
    view: b.ir.features.d!.views.Board!,
    machine: compileMachine(b.ir.features.d!, b.bindings.fns),
    payload: new Map(),
    fns: b.bindings.fns,
  })
  expect(showModal).not.toHaveBeenCalled()
  root.querySelector('button')!.click()
  await Promise.resolve()
  expect(showModal).toHaveBeenCalledTimes(1)
  app.dispatch({ type: 'event', event: 'd.Done', payload: {} })
  expect(root.querySelector('dialog')!.hasAttribute('open')).toBe(false)
  vi.restoreAllMocks()
})

it('aria-current marks only the address shown; a section is current(route) (ADR 0071 A1)', async () => {
  const { currentOf, attrText } = await import('@hozu/runtime-client')
  expect(currentOf('/shop/orders?page=2', '/shop/orders?page=2')).toBe('page')
  expect(currentOf('/shop/orders', '/shop/orders/7')).toBeNull()
  expect(currentOf('/shop/orders', '/shop/orders?page=2')).toBeNull()
  expect(currentOf('/orders', '/orders', true)).toBe('page')
  expect(currentOf('/orders', '/orders/7', true)).toBe('true')
  expect(currentOf('/orders', '/orders', false)).toBeNull()
  expect(attrText('aria-current', false)).toBeNull()
  expect(attrText('aria-current', true)).toBe('true')
})

it('a dialog the server rendered open stays open through hydration, and closing it sends no close event', async () => {
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  const close = vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  const root = document.createElement('div')
  document.body.append(root)
  root.innerHTML = '<main><button type="button">Edit</button><dialog open><p>Form</p></dialog></main>'
  const { createApp } = await import('../src/mount.ts')
  const app = createApp(document, {
    machine: compileMachine(b.ir.features.d!, b.bindings.fns),
    payload: new Map(),
    fns: b.bindings.fns,
    snapshot: { state: 'editing', context: {}, entry: 1 },
  })
  app.attach(root, root.firstChild, b.ir.features.d!.views.Board!.root, [], true)
  expect(close).not.toHaveBeenCalled()
  await Promise.resolve()
  expect(showModal).toHaveBeenCalledTimes(1)
  app.dispatch({ type: 'event', event: 'd.Done', payload: {} })
  expect(app.snapshot()?.state).toBe('idle')
  expect(close).toHaveBeenCalledTimes(1)
  app.dispatch({ type: 'event', event: 'd.Edit', payload: {} })
  expect(app.snapshot()?.state).toBe('editing')
  vi.restoreAllMocks()
  root.remove()
})

it('an island reads current(route) from the page it is on (ADR 0071 A1)', async () => {
  const { project: proj, route, feature: feat } = await import('@hozu/core')
  const list = route({ path: '/orders', params: null, search: null })
  const detail = route({ path: '/orders/:id', params: z.object({ id: z.string() }), search: null })
  const Nav = ui.view({
    machine: m,
    render: ({ current }) =>
      ui.nav({}, [
        ui.a({ href: ui.link(list, null), 'aria-current': current(list) || current(detail) }, ['Orders']),
      ]),
  })
  const built = buildProject(
    proj({
      schema: zodAdapter,
      routes: { list, detail },
      pages: [],
      features: [feat({ id: 'd', intent: { summary: 'nav' }, declarations: [{ Edit, Done, m, Nav }] })],
    }),
  )
  const at = (here: [string, string]) => {
    const root = document.createElement('div')
    mount(root, {
      view: built.ir.features.d!.views.Nav!,
      machine: compileMachine(built.ir.features.d!, built.bindings.fns),
      payload: new Map(),
      fns: built.bindings.fns,
      routes: { list: '/orders', detail: '/orders/:id' },
      here,
    })
    return root.querySelector('a')!.getAttribute('aria-current')
  }
  expect(at(['/orders', 'list'])).toBe('page')
  expect(at(['/orders/7', 'detail'])).toBe('true')
})
