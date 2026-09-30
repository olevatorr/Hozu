// @vitest-environment happy-dom
import { event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { type App, hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

const Bulk = event({ payload: z.object({ tag: z.string().nullable(), action: z.string().nullable() }) })
const bulk = machine({
  context: z.object({ tag: z.string().nullable(), action: z.string().nullable() }),
  initialContext: { tag: null, action: null },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Bulk, {
          target: 'ready',
          assign: (e) => {
            ctx.tag = e.tag
            ctx.action = e.action
          },
        }),
      ],
    },
  }),
})
const Form = ui.view({
  machine: bulk,
  render: () =>
    ui.form({ on: { submit: ui.send(Bulk, { tag: ui.dom.form('tag'), action: ui.dom.form('action') }) } }, [
      ui.input({ type: 'hidden', name: 'tag', value: 'first' }),
      ui.input({ type: 'hidden', name: 'tag', value: 'last' }),
      ui.button({ type: 'submit', name: 'action', value: 'archive' }, ['Archive']),
    ]),
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

  it.fails('ADR 0043 C: ui.dom.form(name) is the first of repeated values on the client, as on the server', () => {
    submitWith()
    expect(app.snapshot()?.context).toMatchObject({ tag: 'first' })
  })

  it.fails('ADR 0043 C: the client form value includes the submitter', () => {
    submitWith()
    expect(app.snapshot()?.context).toMatchObject({ action: 'archive' })
  })

  it.todo('ADR 0043 C: ui.dom.formAll(name) is every value in tree order, submitter included')
})
