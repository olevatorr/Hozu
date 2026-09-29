import { endpoint, feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, sessionCookie } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const status = endpoint({
  method: 'GET',
  path: '/api/status',
  input: z.object({ verbose: z.enum(['yes', 'no']).default('no') }),
  output: z.object({ ok: z.boolean(), user: z.string().nullable(), verbose: z.boolean() }),
})
const hook = endpoint({
  method: 'POST',
  path: '/api/hooks/order',
  input: z.object({ id: z.string().min(2) }),
  output: z.object({ received: z.string() }),
})
const callback = endpoint({
  method: 'GET',
  path: '/auth/callback',
  input: z.object({ code: z.string() }),
  output: 'response',
})
const Home = ui.view({ render: () => ui.main({}, ['Home']) })
const app = project({
  schema: zodAdapter,
  session: z.object({ user: z.string() }),
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
  features: [
    feature({
      id: 'api',
      intent: { summary: 'endpoints' },
      declarations: [{ status, hook, callback, Home }],
    }),
  ],
})
const received: string[] = []
const handler = () =>
  createHandler({
    build: buildProject(app, { sources: false }),
    session: sessionCookie({ name: 'sid', secret: 'x'.repeat(32), secure: false }),
    resolvers: resolvers(app, (implement) => [
      implement(status, ({ verbose }, { session }) => ({
        ok: true,
        user: session?.user ?? null,
        verbose: verbose === 'yes',
      })),
      implement(hook, ({ id }) => {
        received.push(id)
        return { received: id }
      }),
      implement(callback, ({ code }, { setSession }) => {
        setSession({ user: code })
        return new Response(null, { status: 302, headers: { location: '/' } })
      }),
    ]),
  })

describe('declared endpoints (ADR 0037 D6)', () => {
  it('answers GET with the parsed query string and the session, validated both ways', async () => {
    const h = handler()
    const res = await h.fetch(new Request('http://x.test/api/status?verbose=yes'))
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ ok: true, user: null, verbose: true })
  })

  it('answers POST with a JSON body, and 400 with fields for invalid input', async () => {
    const h = handler()
    const ok = await h.fetch(
      new Request('http://x.test/api/hooks/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'o1' }),
      }),
    )
    expect(await ok.json()).toEqual({ received: 'o1' })
    expect(received).toContain('o1')
    const bad = await h.fetch(
      new Request('http://x.test/api/hooks/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'x' }),
      }),
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).fields.id).toMatch(/2/)
  })

  it("returns the handler's Response and sets the session cookie, which later requests read", async () => {
    const h = handler()
    const res = await h.fetch(new Request('http://x.test/auth/callback?code=ada'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!
    expect(cookie).toMatch(/^sid=/)
    const me = await h.fetch(new Request('http://x.test/api/status', { headers: { cookie } }))
    expect((await me.json()).user).toBe('ada')
  })

  it('HZ046 — reserved, non-static, page and duplicate paths', () => {
    const bad = (path: string) => endpoint({ method: 'GET', path, input: z.object({}), output: z.object({}) })
    const p = project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      features: [
        feature({
          id: 'x',
          intent: { summary: 'x' },
          declarations: [
            {
              Home,
              a: bad('/_hozu/x'),
              b: bad('/api/:id'),
              c: bad('/'),
              d: bad('/api/ok'),
              e: bad('/api/ok'),
            },
          ],
        }),
      ],
    })
    const all = validate(buildProject(p, { sources: false }).ir).filter((d) => d.code === 'HZ046')
    expect(all.map((d) => (d.fix?.patch?.[0] as { value?: string } | undefined)?.value ?? null)).toEqual([
      '/api/x',
      '/api',
      '/api',
      null,
    ])
    const found = all.map((d) => d.message)
    expect(found).toEqual([
      'Endpoint path "/_hozu/x" of x.a is reserved',
      'Endpoint path "/api/:id" of x.b is not a static path',
      'Endpoint path "/" of x.c is also a page',
      'GET /api/ok is declared by x.d and x.e',
    ])
  })
})
