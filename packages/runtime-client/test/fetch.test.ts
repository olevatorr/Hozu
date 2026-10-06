import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { event, feature, invoke, machine, mutation, on, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checked } from '../src/fetch.ts'

const dir = mkdtempSync(join(tmpdir(), 'hozu-fetch-client-'))
writeFileSync(join(dir, 'fetch.ts'), 'export const mine = 0\nexport const star = 0\n')
const tick = () => new Promise((r) => setTimeout(r, 0))

const home = route({ path: '/', params: null, search: null })
const reposTag = tag({ param: null })
const mine = query({
  input: z.object({}),
  output: z.array(z.object({ id: z.string(), name: z.string() })),
  errors: { Unauthorized: z.object({}) },
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
  render: () =>
    ui.main({}, [
      ui.query(
        mine,
        {},
        {
          ready: (list) => ui.ul({}, [ui.each(list, 'id', (r) => ui.li({}, [r.name]))]),
          pending: ui.p({}, ['Loading']),
          failed: {
            Unauthorized: () => ui.p({ role: 'alert' }, ['Paste a token']),
            Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]),
          },
        },
      ),
      ui.button({ type: 'button', on: { click: ui.send(Star, { id: '1' }) } }, ['Star']),
    ]),
})
const app = project({
  schema: zodAdapter,
  session: z.object({ user: z.string() }),
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Stars' }) } })],
  features: [
    feature({
      id: 'repos',
      intent: { summary: 'browser effects' },
      declarations: [{ reposTag, mine, star, Star, m, Board }],
      fetch: pathToFileURL(join(dir, 'fetch.ts')),
    }),
  ],
})
const build = buildProject(app, { sources: false })
const data = createDataRuntime({ build, resolvers: resolvers(app, () => []) })

async function page(module: Record<string, unknown>) {
  const { html } = await renderToString({
    build,
    data,
    route: 'home',
    assets: {
      client: '/c.js',
      fns: null,
      styles: null,
      preload: [],
      components: {},
      fetches: { repos: '/f/repos.js' },
    },
  })
  const window = new Window()
  const document = window.document as unknown as Document
  document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
  const loaded: string[] = []
  await hydrate(document, {
    loadFetch: async (url) => {
      loaded.push(url)
      return module
    },
  })
  for (let i = 0; i < 20; i++) await tick()
  return { document, html, loaded }
}

describe('effects that run in the browser (ADR 0049 phase 3)', () => {
  it('reads a browser query after hydration, and a browser mutation re-reads it by tag', async () => {
    let stars = 0
    const { document, html, loaded } = await page({
      mine: async () => [{ id: '1', name: `stars: ${stars}`, extra: 'dropped' }],
      star: async () => {
        stars++
        return {}
      },
    })
    expect(html).toContain('Loading')
    expect(loaded).toEqual(['/f/repos.js'])
    expect(document.querySelector('li')?.textContent).toBe('stars: 0')
    ;(document.querySelector('button') as HTMLButtonElement).click()
    for (let i = 0; i < 20; i++) await tick()
    expect(document.querySelector('li')?.textContent).toBe('stars: 1')
  })

  it('turns fail into the declared branch, and a wrong output into Unexpected with its path', async () => {
    const failing = await page({
      mine: async (_: unknown, { fail }: { fail: (e: string, d: unknown) => never }) =>
        fail('Unauthorized', {}),
      star: async () => ({}),
    })
    expect(failing.document.querySelector('[role=alert]')?.textContent).toBe('Paste a token')
    const wrong = await page({ mine: async () => [{ id: 1 }], star: async () => ({}) })
    expect(wrong.document.querySelector('[role=alert]')?.textContent).toBe(
      'repos.mine returned a value that does not match its output: 0.name: required; 0.id: expected string',
    )
  })
})

describe('the browser schema check', () => {
  it('strips undeclared keys, follows anyOf and $ref, and names the path of each issue', () => {
    const item = {
      type: 'object',
      properties: { id: { type: 'string' }, tag: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      required: ['id', 'tag'],
    }
    expect(checked(item, { id: 'a', tag: null, extra: 1 })).toEqual({
      issues: [],
      value: { id: 'a', tag: null },
    })
    expect(
      checked({ type: 'array', items: { $ref: '#/$defs/item' }, $defs: { item } }, [{ id: 2 }]).issues,
    ).toEqual(['0.tag: required', '0.id: expected string'])
    expect(checked({ type: 'string', minLength: 2 }, 'a').issues).toEqual(['(root): too short'])
  })
})

describe('a machine invoking a browser query (ADR 0065 B)', () => {
  const Look = event({ payload: z.object({}) })
  const lookup = machine({
    context: z.object({ found: z.number() }),
    initialContext: { found: 0 },
    initial: 'idle',
    states: ({ ctx }) => ({
      idle: { on: [on(Look, { target: 'looking' })] },
      looking: {
        invoke: invoke(mine, {
          input: {},
          done: {
            target: 'idle',
            assign: (r) => {
              ctx.found = r.length
            },
          },
          failed: { Unauthorized: 'idle', Unexpected: 'idle' },
        }),
      },
    }),
  })
  const Finder = ui.view({
    machine: lookup,
    render: ({ ctx }) =>
      ui.main({}, [
        ui.query(
          mine,
          {},
          {
            ready: (list) => ui.p({}, [list.length]),
            failed: { Unauthorized: () => null, Unexpected: () => null },
          },
        ),
        ui.button({ type: 'button', on: { click: ui.send(Look, {}) } }, ['Look']),
        ui.output({}, [ctx.found]),
      ]),
  })
  const finderApp = project({
    schema: zodAdapter,
    session: z.object({ user: z.string() }),
    routes: { home },
    pages: [ui.page(home, { views: [Finder], head: { render: () => ({ title: 'Find' }) } })],
    features: [
      feature({
        id: 'repos',
        intent: { summary: 'invoke a browser query' },
        declarations: [{ reposTag, mine, Look, lookup, Finder }],
        fetch: pathToFileURL(join(dir, 'fetch.ts')),
      }),
    ],
  })
  const finderBuild = buildProject(finderApp, { sources: false })

  it('runs the query once for the invoke, without re-reading by its tags', async () => {
    let reads = 0
    const { html } = await renderToString({
      build: finderBuild,
      data: createDataRuntime({ build: finderBuild, resolvers: resolvers(finderApp, () => []) }),
      route: 'home',
      assets: {
        client: '/c.js',
        fns: null,
        styles: null,
        preload: [],
        components: {},
        fetches: { repos: '/f/repos.js' },
      },
    })
    const window = new Window()
    const document = window.document as unknown as Document
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    await hydrate(document, {
      loadFetch: async () => ({
        mine: async () => {
          reads++
          return [{ id: '1', name: 'a' }]
        },
      }),
    })
    for (let i = 0; i < 20; i++) await tick()
    expect(reads).toBe(1)
    ;(document.querySelector('button') as HTMLButtonElement).click()
    for (let i = 0; i < 20; i++) await tick()
    expect(document.querySelector('output')?.textContent).toBe('1')
    expect(reads).toBe(2)
  })
})
