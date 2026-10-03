import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { event, feature, invoke, machine, mutation, on, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const dir = mkdtempSync(join(tmpdir(), 'hozu-runs-server-'))
const file = join(dir, 'fetch.ts')
writeFileSync(
  file,
  `export const search = async ({ q }, { fail, env }) =>
  q === 'none' ? fail('Empty', { q }) : [{ id: '1', name: q + ' via ' + (env.API ?? 'fetch.ts') }]
export const mine = async () => [{ id: '2', name: 'never on the server' }]
export const star = async () => ({})
`,
)

const home = route({ path: '/', params: null, search: z.object({ q: z.string().default('hozu') }) })
const reposTag = tag({ param: null })
const Repos = z.array(z.object({ id: z.string(), name: z.string() }))
const search = query({
  input: z.object({ q: z.string() }),
  output: Repos,
  errors: { Empty: z.object({ q: z.string() }) },
  scope: 'public',
  freshness: 'request',
})
const mine = query({
  input: z.object({}),
  output: Repos,
  scope: 'user',
  freshness: 'request',
  tags: () => [reposTag()],
  runs: 'browser',
})
const star = mutation({
  input: z.object({ id: z.string() }),
  output: z.object({}),
  invalidates: () => [reposTag()],
  runs: 'browser',
})
const save = mutation({
  input: z.object({ id: z.string() }),
  output: z.object({}),
  invalidates: () => [reposTag()],
  runs: 'server',
})
const Star = event({ payload: z.object({ id: z.string() }) })
const m = machine({
  context: z.object({ id: z.string() }),
  initialContext: { id: '' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Star, {
          target: 'starring',
          assign: (e) => {
            ctx.id = e.id
          },
        }),
      ],
    },
    starring: {
      invoke: invoke(star, { input: { id: ctx.id }, done: 'idle', failed: { Unexpected: 'idle' } }),
    },
  }),
})
const Board = ui.view({
  machine: m,
  route: home,
  render: ({ search: s }) =>
    ui.main({}, [
      ui.query(
        search,
        { q: s.q },
        {
          ready: (list) =>
            ui.ul({ 'aria-label': 'Search' }, [ui.each(list, 'id', (r) => ui.li({}, [r.name]))]),
          failed: { Empty: (e) => ui.p({ role: 'alert' }, [`Nothing for ${e.q}`]), Unexpected: () => null },
        },
      ),
      ui.query(
        mine,
        {},
        {
          ready: (list) => ui.ul({ 'aria-label': 'Mine' }, [ui.each(list, 'id', (r) => ui.li({}, [r.name]))]),
          pending: ui.p({}, ['Loading your repositories']),
          failed: { Unexpected: () => null },
        },
      ),
      ui.form({ on: { submit: ui.send(Star, { id: ui.dom.form('id') }) } }, [
        ui.input({ name: 'id', 'aria-label': 'Id' }),
        ui.button({ type: 'submit' }, ['Star']),
      ]),
    ]),
})
const app = project({
  schema: zodAdapter,
  session: z.object({ user: z.string() }),
  env: { server: z.object({}), public: z.object({ API: z.string().optional() }) },
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Repos' }) } })],
  features: [
    feature({
      id: 'repos',
      intent: { summary: 'runs on the server' },
      declarations: [{ reposTag, search, mine, star, save, Star, m, Board }],
      fetch: pathToFileURL(file),
    }),
  ],
})
const handler = () =>
  createHandler({
    build: buildProject(app, { sources: false }),
    resolvers: resolvers(app, (implement) => [implement(save, () => ({}))]),
    env: { API: 'the public API' },
    components: { urls: {}, files: {}, fetches: { repos: '/_hozu/c/fetch-repos.js' } },
    onError: () => {},
  })
const html = async (path: string) =>
  await (await handler().fetch(new Request(`http://localhost${path}`))).text()
const payloadOf = (page: string) =>
  JSON.parse(/<script type="application\/json" id="hozu-payload">([\s\S]*?)<\/script>/.exec(page)![1]!)

describe('where effects run on a server (ADR 0049 phase 2)', () => {
  it("renders an 'either' query through fetch.ts on the server, with public env and declared errors", async () => {
    expect(await html('/?q=tenon')).toContain('<li>tenon via the public API</li>')
    expect(await html('/?q=none')).toContain('Nothing for none')
  })

  it("renders a 'browser' query's pending branch and never runs it", async () => {
    const page = await html('/')
    expect(page).toContain('Loading your repositories')
    expect(page).not.toContain('never on the server')
    const payload = payloadOf(page)
    expect(payload.data).toEqual([])
    expect(
      Object.fromEntries(
        Object.entries(payload.effects).map(([k, e]: [string, any]) => [k, [e.kind, e.runs]]),
      ),
    ).toEqual({
      'repos.mine': ['query', 'browser'],
      'repos.star': ['mutation', 'browser'],
    })
    expect(payload.effects['repos.mine'].tags).toEqual([{ tag: 'repos.reposTag', param: null }])
    expect(payload.env).toEqual({ API: 'the public API' })
  })

  it('refuses browser effects on /_hozu/query and /_hozu/effect, and lists invalidated tags', async () => {
    const h = handler()
    const post = (path: string, body: unknown) =>
      h.fetch(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost' },
          body: JSON.stringify(body),
        }),
      )
    const q = await post('/_hozu/query', { query: 'repos.mine', input: {} })
    expect([q.status, await q.text()]).toEqual([
      400,
      'repos.mine runs in the browser; the server never runs it',
    ])
    const e = await post('/_hozu/effect', { effect: 'repos.star', input: { id: '1' }, keys: [] })
    expect(e.status).toBe(400)
    const saved = await post('/_hozu/effect', { effect: 'repos.save', input: { id: '1' }, keys: [] })
    expect((await saved.json()).tags).toEqual(['repos.reposTag'])
  })

  it('answers a native post that would start a browser mutation with 400', async () => {
    const page = await html('/')
    const action = /<form[^>]*action="([^"]*)"/.exec(page)![1]!.replace(/&amp;/g, '&')
    const r = await handler().fetch(
      new Request(`http://localhost${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
        body: 'id=1',
      }),
    )
    const body = await r.text()
    expect([r.status, r.headers.get('content-type')]).toEqual([400, 'text/html; charset=utf-8'])
    expect(body).toContain('<h1>This form needs JavaScript</h1>')
    expect(body).toContain('repos.star runs in the browser')
    expect(body).toContain('<a href="/">Back to the page</a>')
  })

  it('refuses a server resolver for an effect that is not runs: server', () => {
    expect(() =>
      createHandler({
        build: buildProject(app, { sources: false }),
        resolvers: resolvers(app, (implement) => [implement(save, () => ({})), implement(search, () => [])]),
        components: { urls: {}, files: {}, fetches: { repos: '/_hozu/c/fetch-repos.js' } },
      }),
    ).toThrow("repos.search is implemented in the server resolvers, but runs: 'either'")
  })
})
