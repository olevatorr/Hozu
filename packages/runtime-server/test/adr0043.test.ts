import { feature, mutation, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, sessionCookie } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const origin = 'http://app.test'
const Session = z.object({ user: z.string() })
const notesTag = tag({ param: null })
const me = query({
  input: z.object({}),
  output: z.object({ name: z.string() }),
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'live',
  tags: () => [notesTag()],
})
const listNotes = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'user',
  freshness: 'live',
  tags: () => [notesTag()],
})
const signIn = mutation({ input: z.object({ name: z.string() }), output: z.object({}) })
const signOut = mutation({ input: z.object({}), output: z.object({}) })
const deleteAccount = mutation({ input: z.object({}), output: z.object({}), invalidates: () => [notesTag()] })
const home = route({ path: '/notes', params: null, search: null })
const login = route({ path: '/login', params: null, search: null })
const Board = ui.view({ render: () => ui.main({}, ['Notes']) })
const Login = ui.view({ render: () => ui.main({}, ['Sign in']) })

const app = (extra: { http?: { basePath: `/${string}` }; locales?: string[] } = {}) =>
  project({
    schema: zodAdapter,
    session: Session,
    site: { url: origin, name: 'Notes', lang: 'en', ...(extra.locales ? { locales: extra.locales } : {}) },
    routes: { home, login },
    pages: [
      ui.page(home, {
        views: [Board],
        head: {
          query: me,
          input: () => ({}),
          render: () => ({ title: 'Notes' }),
          redirects: { Unauthorized: login },
        },
      }),
      ui.page(login, { views: [Login], head: { render: () => ({ title: 'Sign in' }) } }),
    ],
    ...(extra.http ? { http: extra.http } : {}),
    features: [
      feature({
        id: 'notes',
        intent: { summary: 'ADR 0043 session repro' },
        declarations: [{ notesTag, me, listNotes, signIn, signOut, deleteAccount, Board, Login }],
      }),
    ],
  })

function setup(extra: Parameters<typeof app>[0] = {}) {
  const p = app(extra)
  const accounts = new Map<string, string[]>([['zed', ['Mine']]])
  const seen: (string | null)[] = []
  const handler = createHandler({
    build: buildProject(p, { sources: false }),
    session: sessionCookie({ name: 'sid', secret: 'x'.repeat(40), secure: false }),
    csp: false,
    preview: { secret: 's'.repeat(32) },
    resolvers: resolvers(p, (implement) => [
      implement(me, (_, { session, fail }) =>
        session && accounts.has(session.user) ? { name: session.user } : fail('Unauthorized', {}),
      ),
      implement(listNotes, (_, { session }) => {
        seen.push(session?.user ?? null)
        return session ? (accounts.get(session.user) ?? []) : []
      }),
      implement(signIn, ({ name }, { setSession }) => {
        if (!accounts.has(name)) accounts.set(name, [])
        setSession({ user: name })
        return {}
      }),
      implement(signOut, (_, { setSession }) => {
        setSession(null)
        return {}
      }),
      implement(deleteAccount, (_, { session, setSession }) => {
        if (session) accounts.delete(session.user)
        setSession(null)
        return {}
      }),
    ]),
  })
  const post = (path: string, body: unknown, cookie = '') =>
    handler.fetch(
      new Request(origin + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', cookie },
        body: JSON.stringify(body),
      }),
    )
  const effect = (name: string, input: unknown, cookie = '', keys: string[] = []) =>
    post('/_hozu/effect', { effect: `notes.${name}`, input, keys }, cookie)
  const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!
  const get = (path: string, cookie = '') =>
    handler.fetch(new Request(origin + path, { headers: { cookie } }))
  return { handler, accounts, seen, post, effect, cookieOf, get }
}

describe('ADR 0043 B (sessions)', () => {
  it.fails('ADR 0043 D9a: the effect response recomputes queries with the post-mutation session', async () => {
    const { effect, cookieOf, seen } = setup()
    const zed = cookieOf(await effect('signIn', { name: 'zed' }))
    seen.length = 0
    const res = await effect('deleteAccount', {}, zed, ['notes.listNotes{}'])
    const body = (await res.json()) as { refreshed: [string, { ok: boolean; value?: unknown }][] }
    expect(seen).not.toContain('zed')
    expect(body.refreshed.map(([, r]) => r.value)).not.toContainEqual(['Mine'])
  })

  it.fails('ADR 0043 D9b: the SSE tag message is sent after the effect response is built', async () => {
    const { handler, effect, cookieOf } = setup()
    const zed = cookieOf(await effect('signIn', { name: 'zed' }))
    const reader = (await handler.fetch(new Request(`${origin}/_hozu/live`))).body!.getReader()
    const order: string[] = []
    const message = (async () => {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        if (new TextDecoder().decode(value).startsWith('data:')) return order.push('sse')
      }
    })()
    await effect('deleteAccount', {}, zed, ['notes.listNotes{}', 'notes.me{}']).then(() =>
      order.push('response'),
    )
    await message
    await reader.cancel()
    expect(order).toEqual(['response', 'sse'])
  })

  it.fails('ADR 0043 D9c: a cookie issued before sign-out is rejected afterwards', async () => {
    const { effect, post, cookieOf } = setup()
    const zed = cookieOf(await effect('signIn', { name: 'zed' }))
    await effect('signOut', {}, zed)
    const replay = await post('/_hozu/query', { query: 'notes.me', input: {} }, zed)
    expect(await replay.json()).toMatchObject({ ok: false, error: 'Unauthorized' })
  })
})

describe('ADR 0043 D (pages)', () => {
  it.todo('ADR 0043 D: a declared head error maps to 403 through head.failed')

  it.fails('ADR 0043 D: a head redirect Location carries basePath and the page locale', async () => {
    const { get } = setup({ http: { basePath: '/app' }, locales: ['en', 'de'] })
    const res = await get('/app/de/notes')
    expect([res.status, res.headers.get('location')]).toEqual([303, '/app/de/login'])
  })
})

describe('ADR 0043 F (i18n)', () => {
  it.fails('ADR 0043 F: the default locale is unprefixed (/login answers 200, no redirect)', async () => {
    const { get } = setup({ locales: ['en', 'de'] })
    const res = await get('/login')
    expect([res.status, res.headers.get('location')]).toEqual([200, null])
  })

  it.fails('ADR 0043 F: internal() rejects /\\ (the preview exit is not an open redirect)', async () => {
    const { get } = setup()
    const location = (await get('/_hozu/preview/exit?path=/\\evil.example')).headers.get('location')!
    expect(new URL(location, origin).origin).toBe(origin)
  })
})
