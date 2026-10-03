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

const build = (
  declarations: Record<string, unknown>,
  options: { fetch?: URL; head?: unknown; connect?: unknown[]; env?: boolean | 'url' } = {},
) => {
  const View = ui.view({ render: () => ui.main({}, ['x']) })
  const all = { View, ...declarations }
  const app = project({
    schema: zodAdapter,
    ...(options.env
      ? {
          env: {
            server: z.object({}),
            public: z.object({
              API_URL:
                options.env === 'url' ? z.string().url().default('https://api.github.com') : z.string(),
            }),
          },
        }
      : {}),
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
        ...(options.connect ? { connect: options.connect as never } : {}),
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

describe('connect: the origins browser-run effects call (ADR 0051)', () => {
  const search = query({ input: z.object({}), output: Repos, scope: 'public', freshness: 'request' })
  const calls = fetchFile(
    'calls.ts',
    "export const search = implement(async () => (await fetch('https://api.github.com/search?q=x')).json())\nconst local = 'http://localhost:8080/docs'\n// docs: https://docs.github.com/rest\n/* https://example.com */\n",
  )
  const of = (codes: (readonly [string, string])[], code: string) =>
    codes.filter(([c]) => c === code).map(([, m]) => m)

  it('warns about a URL written in fetch.ts whose origin connect does not list (HZ083)', () => {
    expect(of(build({ search }, { fetch: calls }).codes, 'HZ083')).toEqual([
      'fetch.ts of repos calls http://localhost:8080, https://api.github.com from the browser, but connect does not list them',
    ])
    const declared = build(
      { search },
      { fetch: calls, connect: ['https://api.github.com', 'http://localhost:8080/'] },
    )
    expect(of(declared.codes, 'HZ083')).toEqual([])
    expect(declared.b.ir.features.repos!.connect).toEqual([
      { origin: 'https://api.github.com' },
      { origin: 'http://localhost:8080' },
    ])
  })

  it('warns about a public env URL that fetch.ts reads, and takes an env default as declared (HZ083)', () => {
    const viaEnv = fetchFile(
      'env.ts',
      'export const search = implement(async (_, { env }) => (await fetch(`${env.API_URL}/search`)).json())\n',
    )
    expect(of(build({ search }, { fetch: viaEnv, env: 'url' }).codes, 'HZ083')).toEqual([
      'fetch.ts of repos calls env.API_URL from the browser, but connect does not list it',
    ])
    expect(
      of(build({ search }, { fetch: viaEnv, env: 'url', connect: [{ env: 'API_URL' }] }).codes, 'HZ083'),
    ).toEqual([])
    const literal = fetchFile(
      'literal.ts',
      "export const search = implement(async () => (await fetch('https://api.github.com/x')).json())\n",
    )
    expect(
      of(build({ search }, { fetch: literal, env: 'url', connect: [{ env: 'API_URL' }] }).codes, 'HZ083'),
    ).toEqual([])
  })

  it('refuses an entry that is not an origin, and an env variable the project does not declare (HZ081)', () => {
    const ok = fetchFile('plain.ts', 'export const search = implement(async () => [])\n')
    expect(
      of(build({ search }, { fetch: ok, connect: ['https://api.github.com/v3', 'ftp://x'] }).codes, 'HZ081'),
    ).toEqual([
      'connect[0] of repos is not an origin: "https://api.github.com/v3"',
      'connect[1] of repos is not an origin: "ftp://x"',
    ])
    expect(of(build({ search }, { fetch: ok, connect: [{ env: 'API_URL' }] }).codes, 'HZ081')).toEqual([
      'connect of repos names the public env variable API_URL, which project({ env: { public } }) does not declare',
    ])
    expect(
      of(build({ search }, { fetch: ok, connect: [{ env: 'API_URL' }], env: true }).codes, 'HZ081'),
    ).toEqual([])
  })
})

describe('environment conventions (ADR 0052)', () => {
  const withEnv = (env: Record<string, unknown>) => {
    const app = project({
      schema: zodAdapter,
      env: env as never,
      routes: { home },
      pages: [
        ui.page(home, {
          views: [ui.view({ render: () => ui.main({}, ['x']) })],
          head: { render: () => ({ title: 'x' }) },
        }),
      ],
      features: [],
    })
    const b = buildProject(app, { sources: false })
    return validate(b.ir).map((d) => [d.code, d.message] as const)
  }

  it('warns about a public variable named like a secret (HZ084), unless it says PUBLIC_ or PUBLISHABLE', () => {
    const codes = withEnv({
      public: z.object({
        STRIPE_SECRET_KEY: z.string(),
        GITHUB_TOKEN: z.string(),
        STRIPE_PUBLISHABLE_KEY: z.string(),
        PUBLIC_MAPS_KEY: z.string(),
        SITE_NAME: z.string(),
      }),
    })
    expect(codes.filter(([c]) => c === 'HZ084').map(([, m]) => m)).toEqual([
      'The public env variable GITHUB_TOKEN looks like a secret, and public values are sent to the browser',
      'The public env variable STRIPE_SECRET_KEY looks like a secret, and public values are sent to the browser',
    ])
  })

  it('refuses an internal mapping to undeclared variables (HZ085)', () => {
    const codes = withEnv({
      public: z.object({ API: z.string() }),
      server: z.object({ API_INTERNAL: z.string().optional() }),
      internal: { API: 'API_INTERNAL', OTHER: 'MISSING' },
    })
    expect(codes.filter(([c]) => c === 'HZ085').map(([, m]) => m)).toEqual([
      'env.internal maps OTHER to MISSING, but OTHER is not a public variable and MISSING is not a server variable',
    ])
  })
})
