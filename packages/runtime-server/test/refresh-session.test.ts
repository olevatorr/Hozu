import { feature, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { app, createHandler, memorySessions, type SessionStore } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Session = z.object({ user: z.string(), token: z.string(), expires: z.number() })
const token = query({
  input: z.object({}),
  output: z.string(),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'anyone',
})
const home = route({ path: '/', params: null, search: null })
const Token = ui.view({
  render: () =>
    ui.main({}, [
      ui.query(
        token,
        {},
        { ready: (t) => ui.p({ class: 'token' }, [t]), failed: { Unexpected: () => ui.p({}, ['?']) } },
      ),
    ]),
})
const config = project({
  schema: zodAdapter,
  session: Session,
  routes: { home },
  pages: [ui.page(home, { views: [Token], head: { render: () => ({ title: 'Token' }) } })],
  features: [feature({ id: 'api', intent: { summary: 'ADR 0060 C' }, declarations: [{ token, Token }] })],
})
const appResolvers = resolvers(config, (implement) => [
  implement(token, (_, { session }) => session?.token ?? 'signed out'),
])

type Next = z.infer<typeof Session> | null | undefined

function setup(refresh: (s: z.infer<typeof Session>) => Next | Promise<Next>) {
  const store = memorySessions({ secret: 'x'.repeat(40), secure: false })
  const calls: z.infer<typeof Session>[] = []
  const errors: unknown[] = []
  const handler = createHandler(
    app({
      resolvers: appResolvers,
      csp: false,
      onError: (error) => errors.push(error),
      refreshSession: async (session) => {
        calls.push(session)
        return refresh(session)
      },
    }),
    { session: store },
  )
  const get = async (cookie: string) => {
    const r = await handler.fetch(new Request('https://app.test/', { headers: { cookie } }))
    return {
      setCookie: r.headers.get('set-cookie'),
      token: /class="token">([^<]*)/.exec(await r.text())?.[1],
    }
  }
  return { store, calls, errors, get }
}

const signedIn = async (store: SessionStore, expires: number) =>
  (await store.issue({ user: 'ada', token: 't1', expires })).split(';')[0]!

describe('refreshSession (ADR 0060 C)', () => {
  it('replaces an expired session in place before the query reads it, and keeps the cookie', async () => {
    const { store, calls, get } = setup((s) =>
      s.expires < 100 ? { ...s, token: 't2', expires: 200 } : undefined,
    )
    const cookie = await signedIn(store, 50)
    expect(await get(cookie)).toEqual({ setCookie: null, token: 't2' })
    expect(await get(cookie)).toEqual({ setCookie: null, token: 't2' })
    expect(calls.map((s) => s.token)).toEqual(['t1', 't2'])
  })

  it('calls the hook once for parallel requests of one session', async () => {
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { store, calls, get } = setup(async (s) => {
      await gate
      return { ...s, token: 't2', expires: 200 }
    })
    const cookie = await signedIn(store, 50)
    const pages = Promise.all([get(cookie), get(cookie), get(cookie)])
    release()
    expect((await pages).map((p) => p.token)).toEqual(['t2', 't2', 't2'])
    expect(calls).toHaveLength(1)
  })

  it('never brings back a session signed out while the hook ran', async () => {
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { store, get } = setup(async (s) => {
      await gate
      return { ...s, token: 't2', expires: 200 }
    })
    const cookie = await signedIn(store, 50)
    const request = new Request('https://app.test/', { headers: { cookie } })
    const page = get(cookie)
    await new Promise((r) => setTimeout(r, 10))
    await store.write(null, request)
    release()
    expect((await page).token).toBe('signed out')
    expect(await store.read(request)).toBeNull()
  })

  it('shares one call per session whatever other cookies a request carries, also just after it', async () => {
    const { store, calls, get } = setup((s) =>
      s.expires < 100 ? { ...s, token: 't2', expires: 200 } : undefined,
    )
    const cookie = await signedIn(store, 50)
    const pages = await Promise.all([get(cookie), get(`${cookie}; theme=dark`), get(`a=1; ${cookie}`)])
    expect(pages.map((p) => p.token)).toEqual(['t2', 't2', 't2'])
    expect(calls.map((s) => s.token)).toEqual(['t1'])
  })

  it('signs out on null, and keeps the session when the hook throws or returns something else', async () => {
    const out = setup(() => null)
    const cookie = await signedIn(out.store, 50)
    expect((await out.get(cookie)).token).toBe('signed out')
    expect(await out.store.read(new Request('https://app.test/', { headers: { cookie } }))).toBeNull()

    const broken = setup(() => {
      throw new Error('token endpoint down')
    })
    const kept = await signedIn(broken.store, 50)
    expect((await broken.get(kept)).token).toBe('t1')
    expect(String(broken.errors[0])).toContain('token endpoint down')

    const wrong = setup(() => ({ user: 'ada' }) as never)
    const same = await signedIn(wrong.store, 50)
    expect((await wrong.get(same)).token).toBe('t1')
    expect(String(wrong.errors[0])).toContain('refreshSession returned a value that is not a session')
  })

  it('needs a project with a session', () => {
    const plain = project({ schema: zodAdapter, routes: { home }, pages: [], features: [] })
    expect(() =>
      createHandler(app({ resolvers: resolvers(plain, () => []), refreshSession: () => undefined })),
    ).toThrow('this project declares none')
  })

  it('needs a store that can replace a value in place', () => {
    const store = memorySessions({ secret: 'x'.repeat(40) })
    const { update: _, ...without } = store
    expect(() =>
      createHandler({
        build: buildProject(config, { sources: false }),
        resolvers: appResolvers,
        session: () => ({ user: 'ada', token: 't', expires: 0 }),
        refreshSession: () => undefined,
      }),
    ).toThrow('refreshSession needs a session store with update(request, value)')
    expect(() =>
      createHandler(app({ resolvers: appResolvers, refreshSession: () => undefined }), { session: without }),
    ).toThrow('refreshSession needs a session store with update(request, value)')
  })
})
