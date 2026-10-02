import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exportStatic } from '@hozu/adapter-static'
import { bundleComponents } from '@hozu/bundle'
import { event, feature, invoke, machine, mutation, on, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const dir = mkdtempSync(join(tmpdir(), 'hozu-static-runs-'))
writeFileSync(
  join(dir, 'fetch.ts'),
  `export const mine = async () => [{ id: '1', name: 'from the browser' }]
export const star = async () => ({})
`,
)
writeFileSync(
  join(dir, 'node.ts'),
  "import { readFileSync } from 'node:fs'\nexport const mine = async () => readFileSync('x')\nexport const star = async () => ({})\n",
)

const home = route({ path: '/', params: null, search: null })
const reposTag = tag({ param: null })
const mine = query({
  input: z.object({}),
  output: z.array(z.object({ id: z.string(), name: z.string() })),
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
const save = mutation({ input: z.object({ id: z.string() }), output: z.object({}), runs: 'server' })
const Star = event({ payload: z.object({ id: z.string() }) })
const Save = event({ payload: z.object({ id: z.string() }) })
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
        on(Save, {
          target: 'saving',
          assign: (e) => {
            ctx.id = e.id
          },
        }),
      ],
    },
    starring: {
      invoke: invoke(star, { input: { id: ctx.id }, done: 'idle', failed: { Unexpected: 'idle' } }),
    },
    saving: { invoke: invoke(save, { input: { id: ctx.id }, done: 'idle', failed: { Unexpected: 'idle' } }) },
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
          pending: ui.p({}, ['Loading your repositories']),
          failed: { Unexpected: () => null },
        },
      ),
      ui.button({ type: 'button', on: { click: ui.send(Star, { id: '1' }) } }, ['Star']),
      ui.button({ type: 'button', on: { click: ui.send(Save, { id: '1' }) } }, ['Save']),
    ]),
})
const appWith = (fetch: string) =>
  project({
    schema: zodAdapter,
    session: z.object({ user: z.string() }),
    site: { url: 'https://stars.example', name: 'Stars', lang: 'en' },
    routes: { home },
    pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Stars' }) } })],
    features: [
      feature({
        id: 'repos',
        intent: { summary: 'a static host' },
        declarations: [{ reposTag, mine, star, save, Star, Save, m, Board }],
        fetch: pathToFileURL(join(dir, fetch)),
      }),
    ],
  })

describe('browser effects on a static host (ADR 0049 phase 4)', () => {
  it('bundles fetch.ts for the browser, writes the pending page, and lists the server effects the page still calls', async () => {
    const app = appWith('fetch.ts')
    const build = buildProject(app, { sources: false })
    const components = await bundleComponents(build, { minify: false })
    expect(components.diagnostics).toEqual([])
    expect(components.fetches.repos).toMatch(/^\/_hozu\/c\/fetch-repos-[A-Z0-9]+\.js$/)
    expect(components.files[components.fetches.repos!]).toContain('from the browser')
    const out = mkdtempSync(join(tmpdir(), 'hozu-static-out-'))
    const result = await exportStatic({
      build,
      resolvers: resolvers(app, (implement) => [implement(save, () => ({}))]),
      outDir: out,
      components,
    })
    expect(result.skipped).toEqual([])
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toContain('Loading your repositories')
    expect(html).not.toContain('from the browser')
    expect(existsSync(join(out, components.fetches.repos!.slice(1)))).toBe(true)
    expect(result.needsServer).toEqual([
      { path: '/', effect: 'repos.save', reason: 'a machine on this page starts it' },
    ])
  })

  it('reports a fetch.ts that imports a Node-only module (HZ081)', async () => {
    const components = await bundleComponents(buildProject(appWith('node.ts'), { sources: false }))
    expect(components.diagnostics.map((d) => [d.code, d.message.split(':')[0]])).toEqual([
      ['HZ081', 'fetch.ts of repos does not bundle for the browser'],
    ])
    expect(components.fetches).toEqual({})
  })
})
