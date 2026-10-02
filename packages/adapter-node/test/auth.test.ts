import { mkdtempSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from '@hozu/adapter-node'
import { feature, mutation, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { memorySessions } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const dir = mkdtempSync(join(tmpdir(), 'hozu-auth-'))
writeFileSync(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>')

const me = query({
  input: z.object({}),
  output: z.object({ user: z.string() }),
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'request',
  runs: 'server',
})
const login = mutation({
  input: z.object({ name: z.string() }),
  output: z.object({}),
  invalidates: () => [],
  runs: 'server',
})
const logout = mutation({ input: z.object({}), output: z.object({}), invalidates: () => [], runs: 'server' })

const home = route({ path: '/', params: null, search: null })
const signIn = route({ path: '/login', params: null, search: null })
const account = route({ path: '/account', params: null, search: null })
const missing = route({ path: '/404', params: null, search: null })

const Account = ui.view({
  render: () =>
    ui.query(
      me,
      {},
      {
        ready: (m) => ui.h1({}, ['Hello ', m.user]),
        pending: null,
        failed: { Unauthorized: () => ui.p({}, ['Sign in']), Unexpected: () => ui.p({}, ['Error']) },
      },
    ),
})
const Plain = (text: string) => ui.view({ render: () => ui.h1({}, [text]) })
const [Home, Login, NotFound] = [Plain('Home'), Plain('Login'), Plain('Nothing here')]
const head = (title: string) => ({
  render: () => ({
    title,
    description: title,
  }),
})

const site = project({
  schema: zodAdapter,
  notFound: missing,
  session: z.object({ user: z.string() }),
  site: {
    url: 'https://auth.example',
    name: 'Auth',
    lang: 'en',
    icon: ui.asset(pathToFileURL(join(dir, 'icon.svg'))),
    themeColor: '#4f46e5',
  },
  routes: { home, signIn, account, missing },
  pages: [
    ui.page(home, { views: [Home], head: head('Home') }),
    ui.page(signIn, { views: [Login], head: head('Login') }),
    ui.page(missing, {
      views: [NotFound],
      head: { ...head('Not found'), render: () => ({ ...head('Not found').render(), noindex: true }) },
    }),
    ui.page(account, {
      views: [Account],
      head: {
        query: me,
        input: () => ({}),
        render: (m) => ({ title: m.user, description: 'Account', noindex: true }),
        failed: { Unauthorized: signIn },
      },
    }),
  ],
  features: [
    feature({
      id: 'auth',
      intent: { summary: 'Session fixture' },
      declarations: [{ me, login, logout, Account, Home, Login, NotFound }],
    }),
  ],
})

const impl = resolvers(site, (implement) => [
  implement(me, (_, { session, fail }) => (session ? { user: session.user } : fail('Unauthorized', {}))),
  implement(login, ({ name }, { setSession }) => {
    setSession({ user: name })
    return {}
  }),
  implement(logout, (_, { setSession }) => {
    setSession(null)
    return {}
  }),
])

describe('redirects, sessions, custom 404, icon (G5, G6, G7, G12)', () => {
  it('works end to end over HTTP', async () => {
    const build = buildProject(site)
    expect(validate(build.ir, { bindings: build.bindings }).filter((d) => d.severity === 'error')).toEqual([])
    const server = createServer({
      build,
      resolvers: impl,
      session: memorySessions({ secret: 'x'.repeat(32), secure: false }),
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const get = (path: string, cookie = '') =>
      fetch(`${base}${path}`, { redirect: 'manual', headers: { cookie } })
    const effect = (name: string, input: unknown, cookie = '') =>
      fetch(`${base}/_hozu/effect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ effect: `auth.${name}`, input, keys: [] }),
      })
    try {
      const anonymous = await get('/account')
      expect(anonymous.status).toBe(303)
      expect(anonymous.headers.get('location')).toBe('/login')

      const signed = await effect('login', { name: 'ada' })
      const cookie = signed.headers.get('set-cookie')!
      expect(cookie).toMatch(/^sid=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/)
      expect(await signed.json()).toEqual({ result: { ok: true, value: {} }, refreshed: [], session: true })
      const session = cookie.split(';')[0]!
      const page = await get('/account', session)
      expect(page.status).toBe(200)
      const text = await page.text()
      expect(text).toContain('<h1>Hello ada</h1>')

      const forged = session.replace(/\.[\w-]+$/, '.AAAA')
      expect((await get('/account', forged)).status).toBe(303)

      const out = await effect('logout', {}, session)
      expect(out.headers.get('set-cookie')).toBe('sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
      expect((await get('/account', session)).status).toBe(303)

      const lost = await get('/nowhere')
      expect(lost.status).toBe(404)
      const body = await lost.text()
      expect(body).toContain('<h1>Nothing here</h1>')
      expect(body).toContain('<meta name="theme-color" content="#4f46e5">')
      expect(body).toMatch(/<link rel="icon" href="\/_hozu\/a\/[0-9a-f]{16}\.svg">/)
    } finally {
      server.close()
    }
  })
})
