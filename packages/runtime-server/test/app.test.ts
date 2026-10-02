import { feature, project, query, route, ui } from '@hozu/core'
import { resolvers } from '@hozu/data'
import { app, appOptionsOf, createHandler, memorySessions } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { BuildErrors, testApp } from '@hozu/testing'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const Session = z.object({ user: z.string() })

const appWith = (freshness: 'request' | { revalidate: number }) => {
  const me = query({
    input: z.object({}),
    output: z.string(),
    scope: 'user',
    freshness: freshness as 'request',
    runs: 'server',
  })
  const Home = ui.view({
    render: () =>
      ui.main({}, [
        ui.query(me, {}, { ready: (name) => ui.p({}, [name]), failed: { Unexpected: () => null } }),
      ]),
  })
  const p = project({
    schema: zodAdapter,
    session: Session,
    routes: { home },
    pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
    features: [feature({ id: 'me', intent: { summary: 'who' }, declarations: [{ me, Home }] })],
  })
  return app({
    resolvers: resolvers(p, (implement) => [implement(me, (_, { session }) => session?.user ?? 'nobody')]),
  })
}

describe('app() (ADR 0043 E)', () => {
  it('createHandler(app) builds from the project of its resolvers', async () => {
    const a = appWith('request')
    expect(appOptionsOf(a)?.resolvers).toBeDefined()
    const res = await createHandler(a).fetch(new Request('http://x.test/'))
    expect(await res.text()).toContain('<p>nobody</p>')
  })

  it('tools may swap only the session store, with a test issuer', async () => {
    const store = memorySessions({ secret: 'x'.repeat(40), secure: false })
    const cookie = (await store.issue({ user: 'ada' })).split(';')[0]!
    const page = await testApp(appWith('request'), { session: store }).get('/', { headers: { cookie } })
    expect(page.text).toContain('ada')
  })

  it('testApp refuses a broken build instead of rendering it', () => {
    expect(() => testApp(appWith({ revalidate: 0 }))).toThrow(BuildErrors)
    expect(() => testApp(appWith({ revalidate: 0 }))).toThrow(/HZ014 .*freshness/)
  })
})

describe('examples/notes answers 403 through head.failed (ADR 0043 D)', () => {
  it('redirects a signed-out visitor, forbids a user and shows the admin the accounts', async () => {
    const notes = (await import('../../../examples/notes/app.ts')).default
    const store = memorySessions({ secret: 'n'.repeat(40), secure: false })
    const as = async (user: string | null) => {
      const cookie = user ? (await store.issue({ user })).split(';')[0]! : ''
      return testApp(notes, { session: store }).get('/admin', { headers: { cookie } })
    }
    const out = await as(null)
    expect([out.status, out.headers.get('location')]).toEqual([303, '/login'])
    const ada = await as('ada')
    expect([ada.status, ada.text]).toEqual([403, expect.stringContaining('Admins only')])
    const root = await as('admin')
    expect([root.status, root.text]).toEqual([200, expect.stringContaining('ada: 2 notes')])
  })
})

describe('examples/notes bulk form: formAll + formRef without JavaScript (ADR 0043 C)', () => {
  it('deletes every checked note and pins through the pressed button', async () => {
    const notes = (await import('../../../examples/notes/app.ts')).default
    const store = memorySessions({ secret: 'n'.repeat(40), secure: false })
    const cookie = (await store.issue({ user: 'cy' })).split(';')[0]!
    const t = testApp(notes, { session: store })
    const form = (html: string, id: string) =>
      [...html.matchAll(/<form[^>]* action="([^"]+)"/g)]
        .map((m) => m[1]!.replace(/&amp;/g, '&'))
        .find((a) => a.endsWith(`__hozu=${encodeURIComponent(id)}`))!
    const send = (action: string, body: [string, string][]) =>
      t.get(action, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      })
    for (const text of ['Milk', 'Bread', 'Eggs'])
      await send(form((await t.get('/', { headers: { cookie } })).html, 'notes.NotesBoard/1'), [
        ['text', text],
      ])
    const page = await t.get('/', { headers: { cookie } })
    expect(page.html).toMatch(
      /<input type="checkbox" form="notes\.NotesBoard\/[^"]+" name="ids" value="n\d+"/,
    )
    const ids = [...page.html.matchAll(/name="ids" value="(n\d+)" aria-label="Select (Milk|Bread)"/g)].map(
      (m) => m[1]!,
    )
    expect(ids).toHaveLength(2)
    const bulk = form(page.html, 'notes.NotesBoard/7/ready/1')
    const none = await send(bulk, [['action', 'delete']])
    expect([none.status, none.text]).toEqual([400, expect.stringContaining('Select at least one note')])
    await send(bulk, [...ids.map((id): [string, string] => ['ids', id]), ['action', 'delete']])
    const after = await t.get('/', { headers: { cookie } })
    expect(after.text).toContain('Eggs')
    expect(after.text).not.toMatch(/Milk|Bread|pinned/)
    const eggs = /name="ids" value="(n\d+)" aria-label="Select Eggs"/.exec(after.html)![1]!
    await send(bulk, [
      ['ids', eggs],
      ['action', 'pin'],
    ])
    expect((await t.get('/', { headers: { cookie } })).text).toContain('Eggs pinned')
  })
})
