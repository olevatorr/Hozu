import { event, feature, fn, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: z.object({ q: z.string().default('') }) })
const Search = event({ payload: z.object({ q: z.string() }) })
const Bump = event({ payload: z.object({}) })
const names = ['Riverside Park', 'Tech Park', 'City Hall']
const matching = fn({
  input: z.object({ q: z.string() }),
  output: z.array(z.string()),
  impl: ({ q }) => ['Riverside Park', 'Tech Park', 'City Hall'].filter((n) => n.toLowerCase().includes(q)),
})
const finder = machine({
  context: z.object({ q: z.string(), n: z.number() }),
  initialContext: { q: '', n: 0 },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Search, {
          target: 'idle',
          assign: (e) => {
            ctx.q = e.q
          },
        }),
        on(Bump, {
          target: 'idle',
          assign: () => {
            ctx.n += 1
          },
        }),
      ],
    },
  }),
})
const Finder = ui.view({
  machine: finder,
  route: home,
  seed: ({ search }) => ({ q: search.q }),
  render: ({ ctx }) =>
    ui.main({}, [
      ui.input({ 'aria-label': 'Search', value: ctx.q, on: { input: ui.send(Search, { q: ui.dom.value }) } }),
      ui.p({}, [`Bumped ${ctx.n}`]),
      ui.form({ on: { submit: ui.send(Bump, {}) } }, [ui.button({ type: 'submit' }, ['Bump'])]),
      ui.ul({}, [ui.each(matching({ q: ctx.q }), null, (name) => ui.li({}, [name]))]),
    ]),
})
const Twin = ui.view({
  machine: finder,
  route: home,
  seed: ({ search }) => ({ q: search.q }),
  render: () => ui.p({}, ['twin']),
})

const appWith = (views: unknown[], declarations: Record<string, unknown>) =>
  project({
    schema: zodAdapter,
    routes: { home },
    pages: [ui.page(home, { views: views as never, head: { render: () => ({ title: 'Stations' }) } })],
    features: [
      feature({
        id: 'stations',
        intent: { summary: 'seed' },
        declarations: [{ Search, Bump, matching, finder, ...declarations }],
      }),
    ],
  })

const items = (html: string) => [...html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1])

describe('seed: a machine starts from the page URL (ADR 0041 A)', () => {
  const app = appWith([Finder], { Finder })
  const handler = () =>
    createHandler({ build: buildProject(app, { sources: false }), resolvers: resolvers(app, () => []) })

  it('renders the seeded context on the server and hands it to the client as the initial context', async () => {
    const html = await (await handler().fetch(new Request('http://localhost/?q=park'))).text()
    expect(items(html)).toEqual(['Riverside Park', 'Tech Park'])
    expect(html).toContain('value="park"')
    const payload = JSON.parse(
      /<script type="application\/json" id="hozu-payload">([\s\S]*?)<\/script>/.exec(html)![1]!,
    )
    expect(payload.features.stations.initialContext).toEqual({ q: 'park', n: 0 })
    expect(items(await (await handler().fetch(new Request('http://localhost/'))).text())).toEqual(names)
  })

  it('starts a native form post from the seeded context too', async () => {
    const app = handler()
    const page = await (await app.fetch(new Request('http://localhost/?q=hall'))).text()
    const action = /<form[^>]*action="([^"]*)"/.exec(page)![1]!.replace(/&amp;/g, '&')
    const response = await app.fetch(
      new Request(`http://localhost${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
        body: '',
      }),
    )
    const html = await response.text()
    expect(html).toContain('Bumped 1')
    expect(items(html)).toEqual(['City Hall'])
  })

  it('HZ048: unknown fields, a seed without a route, and two seeding views on one page', () => {
    const codes = (views: unknown[], declarations: Record<string, unknown>) => {
      const build = buildProject(appWith(views, declarations), { sources: false })
      return [...build.diagnostics, ...validate(build.ir)]
        .filter((d) => d.code === 'HZ048')
        .map((d) => d.message)
    }
    expect(codes([Finder], { Finder })).toEqual([])
    const Stray = ui.view({ machine: finder, seed: () => ({ q: 'x' }), render: () => ui.p({}, ['x']) })
    expect(codes([Finder], { Finder, Stray })).toEqual(['seed needs a view with both a machine and a route'])
    const Typo = ui.view({
      machine: finder,
      route: home,
      seed: ({ search }) => ({ query: search.q }) as never,
      render: () => ui.p({}, ['x']),
    })
    expect(codes([Typo], { Typo })).toEqual(['seed sets "query", which is not a context field of stations'])
    expect(codes([Finder, Twin], { Finder, Twin })).toEqual([
      'Page home lists stations.Finder and stations.Twin, which both seed the stations machine',
    ])
  })
})
