import { event, feature, fn, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, fnModules } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const about = route({ path: '/about', params: null, search: null })
const other = route({ path: '/other', params: null, search: null })

const twice = (n: number) => n * 2
const double = fn({ input: z.object({ n: z.number() }), output: z.number(), impl: ({ n }) => twice(n) })
const quadruple = fn({
  input: z.object({ n: z.number() }),
  output: z.number(),
  impl: ({ n }) => twice(twice(n)),
})
const Inc = event({ payload: z.object({}) })
const counter = machine({
  context: z.object({ n: z.number() }),
  initialContext: { n: 1 },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Inc, {
          assign: () => {
            ctx.n += 1
          },
        }),
      ],
    },
  }),
})
const Counter = ui.view({
  machine: counter,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.button({ type: 'button', on: { click: ui.send(Inc, {}) } }, ['+']),
      ui.p({}, [double({ n: ctx.n }), ' ', quadruple({ n: ctx.n })]),
      ctx.n > 2 && ui.a({ href: ui.link(about, null) }, ['About']),
    ]),
})

const serverOnly = fn({
  input: z.object({ s: z.string() }),
  output: z.string(),
  impl: ({ s }) => s.toUpperCase(),
})
const Static = ui.view({
  render: () => ui.main({}, [serverOnly({ s: 'static' }), ui.a({ href: ui.link(other, null) }, ['Other'])]),
})

const app = project({
  schema: zodAdapter,
  routes: { home, about, other },
  pages: [
    ui.page(home, { views: [Counter, Static], head: { render: () => ({ title: 'Home' }) } }),
    ui.page(about, { views: [Static], head: { render: () => ({ title: 'About' }) } }),
    ui.page(other, { views: [Static], head: { render: () => ({ title: 'Other' }) } }),
  ],
  features: [
    feature({
      id: 'count',
      intent: { summary: 'client fns' },
      declarations: [{ double, quadruple, Inc, counter, Counter }],
    }),
    feature({ id: 'text', intent: { summary: 'server-only fns' }, declarations: [{ serverOnly, Static }] }),
  ],
})
const build = buildProject(app, { sources: false })

describe('per-feature fn modules and page-scoped routes (ADR 0050 C, E)', () => {
  it('ships a module per feature with client fns, each helper once, and nothing only the server calls', async () => {
    const modules = fnModules(build)
    expect(Object.keys(modules)).toEqual(['hozu', 'count'])
    const source = modules.count!.source
    expect(source.match(/const twice = /g)).toHaveLength(1)
    const { fns } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
    expect([fns['count.double']({ n: 3 }), fns['count.quadruple']({ n: 3 })]).toEqual([6, 12])
  })

  it('lists only the page’s modules and the routes its islands can reach', async () => {
    const handler = createHandler({ build, resolvers: resolvers(app, () => []) })
    const html = await (await handler.fetch(new Request('http://localhost/'))).text()
    const payload = JSON.parse(/id="hozu-payload">([\s\S]*?)<\/script>/.exec(html)![1]!)
    const { count, hozu } = fnModules(build)
    expect(payload.fns).toEqual([count!.path, hozu!.path])
    expect(payload.routes).toEqual({ about: '/about' })
    const served = await handler.fetch(new Request(`http://localhost${payload.fns[0]}`))
    expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const plain = await (await handler.fetch(new Request('http://localhost/about'))).text()
    expect(plain).not.toContain('/_hozu/f/')
  })
})
