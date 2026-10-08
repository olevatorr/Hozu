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

it('a dialog whose open follows the machine opens as a modal and closes (ADR 0069 B3)', () => {
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  const root = document.createElement('div')
  const app = mount(root, {
    view: b.ir.features.d!.views.Board!,
    machine: compileMachine(b.ir.features.d!, b.bindings.fns),
    payload: new Map(),
    fns: b.bindings.fns,
  })
  expect(showModal).not.toHaveBeenCalled()
  root.querySelector('button')!.click()
  expect(showModal).toHaveBeenCalledTimes(1)
  app.dispatch({ type: 'event', event: 'd.Done', payload: {} })
  expect(root.querySelector('dialog')!.hasAttribute('open')).toBe(false)
  vi.restoreAllMocks()
})
