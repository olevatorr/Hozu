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
