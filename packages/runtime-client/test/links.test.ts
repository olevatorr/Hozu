// @vitest-environment happy-dom
import { endpoint, event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Currency = z.enum(['TWD', 'USD'])
const home = route({ path: '/', params: null, search: z.object({ currency: Currency.default('TWD') }) })
const report = endpoint({
  method: 'GET',
  path: '/api/report',
  input: z.object({ currency: Currency }),
  output: z.object({}),
})
const SetCurrency = event({ payload: z.object({ currency: Currency }) })
const toggle = machine({
  context: z.object({ currency: Currency }),
  initialContext: { currency: 'TWD' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetCurrency, {
          target: 'idle',
          assign: (e) => {
            ctx.currency = e.currency
          },
        }),
      ],
    },
  }),
})
const Board = ui.view({
  machine: toggle,
  route: home,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.button({ type: 'button', on: { click: ui.send(SetCurrency, { currency: 'USD' }) } }, ['USD']),
      ui.a({ id: 'page', href: ui.link(home, null, { currency: ctx.currency }) }, ['page']),
      ui.a({ id: 'api', href: ui.link(report, { currency: ctx.currency }) }, ['api']),
    ]),
})
const app = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Links' }) } })],
  features: [
    feature({
      id: 'l',
      intent: { summary: 'links follow context' },
      declarations: [{ report, SetCurrency, toggle, Board }],
    }),
  ],
})
const build = buildProject(app, { sources: false })

describe('links built from context (ADR 0056 A1)', () => {
  it('update an href after hydration, for a route and for an endpoint', async () => {
    const data = createDataRuntime({
      build,
      resolvers: resolvers(app, (implement) => [implement(report, () => ({}))]),
    })
    const { html } = await renderToString({ build, data, route: 'home' })
    document.open()
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    document.close()
    await hydrate(document, { loadFns: async () => ({}) })
    const href = (id: string) => document.getElementById(id)?.getAttribute('href')
    expect([href('page'), href('api')]).toEqual(['/', '/api/report?currency=TWD'])
    document.querySelector('button')!.click()
    await new Promise((r) => setTimeout(r, 10))
    expect([href('page'), href('api')]).toEqual(['/?currency=USD', '/api/report?currency=USD'])
  })
})
