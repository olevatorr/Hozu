// @vitest-environment happy-dom
import { event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { type App, hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

const Bulk = event({
  payload: z.object({ tag: z.string().nullable(), action: z.string().nullable(), tags: z.array(z.string()) }),
})
const bulk = machine({
  context: z.object({ tag: z.string().nullable(), action: z.string().nullable(), tags: z.array(z.string()) }),
  initialContext: { tag: null, action: null, tags: [] },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Bulk, {
          target: 'ready',
          assign: (e) => {
            ctx.tag = e.tag
            ctx.action = e.action
            ctx.tags = e.tags
          },
        }),
      ],
    },
  }),
})
const Form = ui.view({
  machine: bulk,
  render: () =>
    ui.form(
      {
        on: {
          submit: ui.send(Bulk, {
            tag: ui.dom.form('tag'),
            action: ui.dom.form('action'),
            tags: ui.dom.formAll('tag'),
          }),
        },
      },
      [
        ui.input({ type: 'hidden', name: 'tag', value: 'first' }),
        ui.input({ type: 'hidden', name: 'tag', value: 'last' }),
        ui.button({ type: 'submit', name: 'action', value: 'archive' }, ['Archive']),
      ],
    ),
})
const home = route({ path: '/', params: null, search: null })
const p = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Form], head: { render: () => ({ title: 'Bulk' }) } })],
  features: [
    feature({ id: 'f', intent: { summary: 'ADR 0043 C repro' }, declarations: [{ Bulk, bulk, Form }] }),
  ],
})
const build = buildProject(p)

let app: App
beforeEach(async () => {
  const data = createDataRuntime({ build, resolvers: resolvers(p, () => []) })
  const { html } = await renderToString({ build, data, route: 'home' })
  document.open()
  document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
  document.close()
  app = (await hydrate(document, { loadFns: async () => build.bindings.fns as never })).get('f')!
})

const submitWith = () => {
  const form = document.querySelector('form')!
  const submitter = document.querySelector('button')!
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }))
}

describe('ADR 0043 C (forms, client)', () => {
  it('builds clean', () => {
    expect(build.diagnostics).toEqual([])
  })

  it('ADR 0043 C: ui.dom.form(name) is the first of repeated values on the client, as on the server', () => {
    submitWith()
    expect(app.snapshot()?.context).toMatchObject({ tag: 'first' })
  })

  it('ADR 0043 C: the client form value includes the submitter', () => {
    submitWith()
    expect(app.snapshot()?.context).toMatchObject({ action: 'archive' })
  })

  it('ADR 0043 C: ui.dom.formAll(name) is every value in tree order, submitter included', () => {
    submitWith()
    expect(app.snapshot()?.context).toMatchObject({ tags: ['first', 'last'] })
  })

  it('ADR 0043 C: without a submitter the button field is absent', () => {
    document
      .querySelector('form')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    expect(app.snapshot()?.context).toMatchObject({ tag: 'first', action: null, tags: ['first', 'last'] })
  })
})
