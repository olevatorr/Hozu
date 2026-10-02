import { endpoint, feature, project, query, route, ui } from '@hozu/core'
import { buildProject, pageTables } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, memorySessions } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const origin = 'http://app.test'
const home = route({ path: '/', params: null, search: null })
const login = route({ path: '/login', params: null, search: null })
const admin = route({ path: '/admin', params: null, search: null })
const gone = route({ path: '/old', params: null, search: null })

const who = query({
  input: z.object({}),
  output: z.object({ name: z.string() }),
  errors: { Unauthorized: z.object({}), Forbidden: z.object({}) },
  scope: 'user',
  freshness: 'request',
  runs: 'server',
})
const retired = query({
  input: z.object({}),
  output: z.object({}),
  errors: { Gone: z.object({}) },
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const exportNotes = endpoint({
  method: 'GET',
  path: '/api/export',
  input: z.object({ format: z.enum(['json', 'csv']).default('json'), limit: z.number().default(10) }),
  output: z.object({ format: z.string(), limit: z.number() }),
  errors: { Unauthorized: z.object({ message: z.string() }) },
  failed: { Unauthorized: 401 },
})
const bulk = endpoint({
  method: 'POST',
  path: '/api/bulk',
  input: z.object({ action: z.enum(['delete', 'archive']) }),
  output: 'redirect',
})
const download = endpoint({ method: 'GET', path: '/api/file', input: z.object({}), output: 'response' })
const page = endpoint({ method: 'GET', path: '/api/page', input: z.object({}), output: 'response' })
const hook = endpoint({
  method: 'POST',
  path: '/api/hook',
  input: 'raw',
  output: z.object({ bytes: z.number() }),
})

const Home = ui.view({
  render: () =>
    ui.main({}, [
      ui.a({ href: ui.link(exportNotes, { format: 'csv', limit: 10 }) }, ['Export']),
      ui.form({ method: 'post', action: ui.link(bulk) }, [
        ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete selected']),
      ]),
    ]),
})
const Admin = ui.view({ render: () => ui.main({}, ['Admin']) })
const Login = ui.view({ render: () => ui.main({}, ['Sign in']) })
const Old = ui.view({ render: () => ui.main({}, ['Old']) })

const app = (basePath: '' | '/app' = '') =>
  project({
    schema: zodAdapter,
    session: z.object({ user: z.string() }),
    site: { url: origin, name: 'App', lang: 'en', locales: ['en', 'de'] },
    routes: { home, login, admin, gone },
    ...(basePath ? { http: { basePath } } : {}),
    pages: [
      ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } }),
      ui.page(login, { views: [Login], head: { render: () => ({ title: 'Sign in' }) } }),
      ui.page(admin, {
        views: [Admin],
        head: {
          query: who,
          input: () => ({}),
          render: () => ({ title: 'Admin' }),
          failed: { Unauthorized: login, Forbidden: 403 },
        },
      }),
      ui.page(gone, {
        views: [Old],
        head: { query: retired, input: () => ({}), render: () => ({ title: 'Old' }), failed: { Gone: 410 } },
      }),
    ],
    features: [
      feature({
        id: 'api',
        intent: { summary: 'ADR 0043 D' },
        declarations: [{ who, retired, exportNotes, bulk, download, page, hook, Home, Admin, Login, Old }],
      }),
    ],
  })

function setup(basePath: '' | '/app' = '') {
  const p = app(basePath)
  const build = buildProject(p, { sources: false })
  const errors: unknown[] = []
  const handler = createHandler({
    build,
    session: memorySessions({ secret: 'x'.repeat(40), secure: false }),
    onError: (e) => errors.push(e),
    resolvers: resolvers(p, (implement) => [
      implement(who, (_, { session, fail }) =>
        !session
          ? fail('Unauthorized', {})
          : session.user === 'root'
            ? { name: 'root' }
            : fail('Forbidden', {}),
      ),
      implement(retired, (_, { fail }) => fail('Gone', {})),
      implement(exportNotes, (input, { session, fail }) =>
        session ? input : fail('Unauthorized', { message: 'Sign in to export' }),
      ),
      implement(bulk, (_, { redirect }) => redirect(ui.link(home, null))),
      implement(
        download,
        () =>
          new Response('a,b\n', {
            headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment' },
          }),
      ),
      implement(page, () => new Response('<h1>Admin</h1>', { headers: { 'content-type': 'text/html' } })),
      implement(hook, (_, { bytes }) => ({ bytes: bytes?.length ?? -1 })),
    ]),
  })
  const get = (path: string, cookie = '') =>
    handler.fetch(new Request(origin + path, { headers: { cookie } }))
  const post = (path: string, body: BodyInit, type: string) =>
    handler.fetch(
      new Request(origin + path, {
        method: 'POST',
        headers: { 'content-type': type, origin, 'sec-fetch-site': 'same-origin' },
        body,
      }),
    )
  return { build, handler, get, post, errors }
}

describe('ADR 0043 D: pages answer through head.failed', () => {
  it('maps declared head errors to a redirect, 403 and 410; Unexpected stays 500', async () => {
    const { get } = setup()
    const signedOut = await get('/admin')
    expect([signedOut.status, signedOut.headers.get('location')]).toEqual([303, '/login'])
    const de = await get('/de/admin')
    expect([de.status, de.headers.get('location')]).toEqual([303, '/de/login'])
    const old = await get('/old')
    expect(old.status).toBe(410)
    expect(await old.text()).toContain('<meta name="robots" content="noindex">')
  })

  it('answers 403 for a Forbidden visitor and 200 for an allowed one', async () => {
    const as = (user: string) => {
      const p = app()
      return createHandler({
        build: buildProject(p, { sources: false }),
        session: () => ({ user }),
        resolvers: resolvers(p, (implement) => [
          implement(who, (_, { session, fail }) =>
            session?.user === 'root' ? { name: 'root' } : fail('Forbidden', {}),
          ),
          implement(retired, (_, { fail }) => fail('Gone', {})),
          implement(exportNotes, (input) => input),
          implement(bulk, (_, { redirect }) => redirect(ui.link(home, null))),
          implement(download, () => new Response('')),
          implement(page, () => new Response('')),
          implement(hook, () => ({ bytes: 0 })),
        ]),
      }).fetch(new Request(`${origin}/admin`))
    }
    expect((await as('ada')).status).toBe(403)
    expect((await as('root')).status).toBe(200)
  })

  it('HZ051: an unmapped, extra or Unexpected head error has choices but no patch', () => {
    const { build } = setup()
    const ir = structuredClone(build.ir)
    delete ir.pages.admin!.head.failed.Forbidden
    ir.pages.gone!.head.failed.Unexpected = { status: 404 }
    const found = validate(ir).filter((d) => d.code === 'HZ051')
    expect(found.map((d) => [d.location.pointer, d.fix?.patch ?? null])).toEqual([
      ['/pages/admin/head/failed', null],
      ['/pages/gone/head/failed/Unexpected', null],
    ])
    expect(found[0]!.fix?.snippet).toBe('failed: { Unauthorized: …, Forbidden: 403 }')
  })
})

describe('ADR 0043 D: endpoints in the shape of mutations', () => {
  it('fail(name, payload) answers the mapped status with { error, message }', async () => {
    const { get } = setup()
    const res = await get('/api/export')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'Sign in to export' })
  })

  it('a schema failure is the framework Invalid, 400 with fields', async () => {
    const { post } = setup()
    const res = await post('/api/bulk', JSON.stringify({ action: 'burn' }), 'application/json')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid', fields: { action: expect.any(String) } })
  })

  it("output 'redirect' answers 303 to ui.link, with basePath", async () => {
    const { post } = setup('/app')
    const res = await post('/app/api/bulk', 'action=delete', 'application/x-www-form-urlencoded')
    expect([res.status, res.headers.get('location')]).toEqual([303, '/app'])
  })

  it("output 'response' passes files through and turns HTML into a 500 with HZ053", async () => {
    const { get, errors } = setup()
    const file = await get('/api/file')
    expect([file.status, file.headers.get('content-type')]).toEqual([200, 'text/csv'])
    const html = await get('/api/page')
    expect(html.status).toBe(500)
    expect(await html.text()).toMatch(/^HZ053 Endpoint api.page answered text\/html/)
    const d = (errors.at(-1) as { diagnostic?: { code: string; location: { pointer: string } } }).diagnostic
    expect([d?.code, d?.location.pointer]).toEqual(['HZ053', '/features/api/endpoints/page'])
  })

  it("input 'raw' hands the resolver the body bytes, unparsed", async () => {
    const { post } = setup()
    const res = await post('/api/hook', 'sig=abc&payload={}', 'application/x-www-form-urlencoded')
    expect(await res.json()).toEqual({ bytes: 18 })
  })

  it('every endpoint response carries nosniff and a referrer policy', async () => {
    const { get } = setup()
    for (const path of ['/api/export', '/api/file', '/api/page']) {
      const res = await get(path)
      expect([res.headers.get('x-content-type-options'), res.headers.get('referrer-policy')]).toEqual([
        'nosniff',
        'strict-origin-when-cross-origin',
      ])
    }
  })
})

describe('ADR 0043 D: links to endpoints', () => {
  it('ui.link(endpoint, input) is a GET URL and ui.link(endpoint) a form action, with basePath', async () => {
    const html = await (await setup('/app').get('/app')).text()
    expect(html).toContain('<a href="/app/api/export?format=csv&amp;limit=10">Export</a>')
    expect(html).toContain('<form method="post" action="/app/api/bulk">')
  })

  it('speculation rules exclude /_hozu/* and GET endpoints under basePath', async () => {
    const html = await (await setup('/app').get('/app')).text()
    const rules = JSON.parse(/<script type="speculationrules">(.*?)<\/script>/.exec(html)![1]!)
    expect(rules.prerender[0].where.and).toEqual([
      { href_matches: '/app/*' },
      { not: { href_matches: '/app/_hozu/*' } },
      { not: { href_matches: '/app/api/export' } },
      { not: { href_matches: '/app/api/file' } },
      { not: { href_matches: '/app/api/page' } },
    ])
  })

  it('checks the form method, field names, failed, raw GET and GET inputs', () => {
    const { build } = setup()
    const ir = structuredClone(build.ir)
    const home = ir.features.api!.views.Home!.root
    const form = home.kind === 'el' ? home.children[1]! : null
    if (form?.kind !== 'el') throw new Error('fixture')
    delete form.attrs.method
    const button = form.children[0]!
    if (button.kind === 'el') button.attrs.name = { literal: 'actoin' }
    ir.features.api!.endpoints.exportNotes!.failed = {}
    ir.features.api!.endpoints.hook!.method = 'GET'
    const found = validate(ir)
      .filter((d) => d.code === 'HZ046')
      .map((d) => d.message)
    expect(found).toEqual([
      'Endpoint api.exportNotes does not map "Unauthorized" to a status',
      'Endpoint api.hook reads a raw body on GET',
      'The form posting to api.bulk has a field "actoin" its input does not declare. Did you mean "action"?',
      'The form posts to api.bulk but its method is GET (the default)',
    ])
  })

  it('HZ032: a string form action that is a POST endpoint gets a patch to ui.link(endpoint)', () => {
    const { build } = setup()
    const ir = structuredClone(build.ir)
    const home = ir.features.api!.views.Home!.root
    const form = home.kind === 'el' ? home.children[1]! : null
    if (form?.kind !== 'el') throw new Error('fixture')
    form.attrs.action = { literal: '/api/bulk' }
    const d = validate(ir).find((x) => x.code === 'HZ032')
    expect(d?.fix?.patch).toEqual([
      {
        op: 'replace',
        path: '/features/api/views/Home/root/children/1/attrs/action',
        value: { endpoint: 'api.bulk', input: null },
      },
    ])
  })
})

describe('ADR 0043 D: exports.endpoints', () => {
  const build = (exported: boolean) => {
    const Other = ui.view({
      render: () => ui.a({ href: ui.link(exportNotes, { format: 'json', limit: 1 }) }, ['x']),
    })
    const api = feature({
      id: 'api',
      intent: { summary: 'owner' },
      declarations: [{ who, exportNotes, Home: Admin }],
      ...(exported ? { exports: [exportNotes] } : {}),
    })
    const p = project({
      schema: zodAdapter,
      session: z.object({ user: z.string() }),
      routes: { home },
      pages: [ui.page(home, { views: [Other], head: { render: () => ({ title: 'x' }) } })],
      features: [
        api,
        feature({ id: 'ui', intent: { summary: 'user' }, imports: [api], declarations: [{ Other }] }),
      ],
    })
    return buildProject(p, { sources: false })
  }

  it('links to another feature’s endpoint only when it is exported and imported (HZ006)', () => {
    const hidden = build(false)
    const d = validate(hidden.ir).filter((x) => x.code === 'HZ006')
    expect(d.map((x) => x.message)).toEqual(['"ui" uses api.exportNotes, which "api" does not export'])
    expect(d[0]!.fix?.patch).toEqual([
      { op: 'add', path: '/features/api/exports/endpoints/-', value: 'exportNotes' },
    ])
    expect(build(true).ir.features.api!.exports.endpoints).toEqual(['exportNotes'])
    expect(validate(build(true).ir).filter((x) => x.code === 'HZ006')).toEqual([])
  })
})

describe('ADR 0043 D: the tables the lock reviews (pageTables)', () => {
  it('lists head failures, endpoint modes and statuses, and redirects', () => {
    const { build } = setup()
    expect(pageTables(build.ir)).toEqual({
      head: {
        admin: { Forbidden: { status: 403 }, Unauthorized: { redirect: 'login' } },
        gone: { Gone: { status: 410 } },
      },
      endpoints: {
        'api.bulk': { mode: 'redirect', failed: {} },
        'api.download': { mode: 'response', failed: {} },
        'api.exportNotes': { mode: 'json', failed: { Unauthorized: 401 } },
        'api.hook': { mode: 'json', failed: {} },
        'api.page': { mode: 'response', failed: {} },
      },
      redirects: {},
    })
  })
})
