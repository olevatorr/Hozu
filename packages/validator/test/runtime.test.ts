import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planRoute } from '@hozu/compiler'
import { event, feature, invoke, machine, mutation, on, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const dir = mkdtempSync(join(tmpdir(), 'hozu-runs-'))
const fetchFile = (name: string, source: string) => {
  const file = join(dir, name)
  writeFileSync(file, source)
  return pathToFileURL(file)
}

const home = route({ path: '/', params: null, search: null })
const reposTag = tag({ param: null })
const Repos = z.array(z.object({ id: z.string(), name: z.string() }))
const Star = event({ payload: z.object({ id: z.string() }) })

const build = (declarations: Record<string, unknown>, options: { fetch?: URL; head?: unknown } = {}) => {
  const View = ui.view({ render: () => ui.main({}, ['x']) })
  const all = { View, ...declarations }
  const app = project({
    schema: zodAdapter,
    routes: { home },
    pages: [
      ui.page(home, {
        views: [(declarations.Board as never) ?? View],
        head: (options.head as never) ?? { render: () => ({ title: 'x' }) },
      }),
    ],
    features: [
      feature({
        id: 'repos',
        intent: { summary: 'runs' },
        declarations: [all],
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }),
    ],
  })
  const b = buildProject(app, { sources: false })
  return { b, codes: [...b.diagnostics, ...validate(b.ir)].map((d) => [d.code, d.message] as const) }
}

describe('runs and fetch.ts (ADR 0049, HZ081)', () => {
  it('defaults to either and needs fetch.ts with an export of the effect', () => {
    const search = query({ input: z.object({}), output: Repos, scope: 'public', freshness: 'request' })
    expect(build({ search }).b.ir.features.repos!.queries.search!.runs).toBe('either')
    expect(
      build({ search })
        .codes.filter(([c]) => c === 'HZ081')
        .map(([, m]) => m),
    ).toEqual(['Feature repos has effects that run in the browser or either side, but no fetch module'])
    const ok = fetchFile('ok.ts', 'export const search = implement(async () => [])\n')
    expect(build({ search }, { fetch: ok }).codes.filter(([c]) => c === 'HZ081')).toEqual([])
    expect(build({ search }, { fetch: ok }).b.ir.features.repos!.fetch?.sourceHash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('reports a missing export, an export of nothing, and a server effect implemented in fetch.ts', () => {
    const search = query({ input: z.object({}), output: Repos, scope: 'public', freshness: 'request' })
    const list = query({
      input: z.object({}),
      output: Repos,
      scope: 'public',
      freshness: 'request',
      runs: 'server',
    })
    const wrong = fetchFile(
      'wrong.ts',
      'export const list = implement(async () => [])\nexport { helper as extra }\n',
    )
    expect(
      build({ search, list }, { fetch: wrong })
        .codes.filter(([c]) => c === 'HZ081')
        .map(([, m]) => m),
    ).toEqual([
      'repos.search runs on either side but fetch.ts exports no search',
      "fetch.ts implements repos.list, which has runs: 'server'",
      'fetch.ts exports extra, which is not a query or mutation of repos',
    ])
  })

  it('keeps per-visitor data off either: a user query must run on the server or in the browser', () => {
    const mine = query({ input: z.object({}), output: Repos, scope: 'user', freshness: 'request' })
    const ok = fetchFile('mine.ts', 'export const mine = implement(async () => [])\n')
    expect(
      build({ mine }, { fetch: ok })
        .codes.filter(([c]) => c === 'HZ081')
        .map(([, m]) => m),
    ).toEqual(["A query with scope: 'user' cannot run on either side"])
  })
})

describe('what only the server can do (ADR 0049, HZ082)', () => {
  const mine = query({
    input: z.object({}),
    output: Repos,
    scope: 'user',
    freshness: 'request',
    tags: () => [reposTag()],
    runs: 'browser',
  })
  const file = fetchFile(
    'browser.ts',
    'export const mine = implement(async () => [])\nexport const star = implement(async () => ({}))\n',
  )

  it('reports a head that reads a browser query', () => {
    const { codes } = build(
      { mine, reposTag },
      { fetch: file, head: { query: mine, input: () => ({}), render: () => ({ title: 'x' }) } },
    )
    expect(codes.filter(([c]) => c === 'HZ082').map(([, m]) => m)).toEqual([
      'The head of page home reads repos.mine, which runs in the browser',
    ])
  })

  it('reports a browser mutation that invalidates a tag a server-cached query reads', () => {
    const cached = query({
      input: z.object({}),
      output: Repos,
      scope: 'public',
      freshness: 'static',
      tags: () => [reposTag()],
      runs: 'server',
    })
    const star = mutation({
      input: z.object({ id: z.string() }),
      output: z.object({}),
      invalidates: () => [reposTag()],
      runs: 'browser',
    })
    const { codes } = build({ mine, cached, star, reposTag }, { fetch: file })
    expect(codes.filter(([c]) => c === 'HZ082').map(([, m]) => m)).toEqual([
      'repos.star runs in the browser but invalidates repos.reposTag, which repos.cached caches on the server',
    ])
  })

  it('warns that a form starting a browser mutation needs JavaScript (HZ036)', () => {
    const star = mutation({ input: z.object({ id: z.string() }), output: z.object({}), runs: 'browser' })
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
        ui.form({ on: { submit: ui.send(Star, { id: ui.dom.form('id') }) } }, [
          ui.input({ name: 'id', 'aria-label': 'Id' }),
          ui.button({ type: 'submit' }, ['Star']),
        ]),
    })
    const starFile = fetchFile('star.ts', 'export const star = implement(async () => ({}))\n')
    const { codes } = build({ Star, star, m, Board }, { fetch: starFile })
    expect(codes.filter(([c]) => c === 'HZ036').map(([, m]) => m)).toEqual([
      'This form only works with JavaScript: repos.Star starts repos.star, which runs in the browser',
    ])
  })
})

describe('the browser region mode (ADR 0049 §3)', () => {
  it('renders a browser query as an island without making its page uncacheable', () => {
    const mine = query({
      input: z.object({}),
      output: Repos,
      scope: 'user',
      freshness: 'request',
      runs: 'browser',
    })
    const Board = ui.view({
      render: () =>
        ui.main({}, [
          ui.query(
            mine,
            {},
            {
              ready: (list) => ui.ul({}, [ui.each(list, 'id', (r) => ui.li({}, [r.name]))]),
              pending: ui.p({}, ['Loading']),
              failed: { Unexpected: () => null },
            },
          ),
        ]),
    })
    const file = fetchFile('plan.ts', 'export const mine = implement(async () => [])\n')
    const { b, codes } = build({ mine, Board }, { fetch: file })
    expect(codes.filter(([, m]) => m.includes('error'))).toEqual([])
    const { plan } = planRoute(b.ir, 'home')
    expect(plan.regions.map((r) => r.mode)).toEqual(['static', 'browser'])
    expect(plan.cacheable).toBe(true)
    expect(plan.islands).toHaveLength(1)
  })
})
