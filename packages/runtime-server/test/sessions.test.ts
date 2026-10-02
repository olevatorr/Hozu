import { event, feature, invoke, machine, mutation, on, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, memorySessions } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const origin = 'http://app.test'
const Session = z.object({ user: z.string() })
const aTag = tag({ param: null })
const bTag = tag({ param: null })
const who = query({
  input: z.object({}),
  output: z.string(),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
})
const listA = query({
  input: z.object({}),
  output: z.number(),
  scope: 'public',
  freshness: 'static',
  tags: () => [aTag()],
  runs: 'server',
})
const listB = query({
  input: z.object({}),
  output: z.number(),
  scope: 'public',
  freshness: 'static',
  tags: () => [bTag()],
  runs: 'server',
})
const touchA = mutation({
  input: z.object({}),
  output: z.object({}),
  invalidates: () => [aTag()],
  runs: 'server',
})
const signIn = mutation({ input: z.object({ name: z.string() }), output: z.object({}), runs: 'server' })
const expire = mutation({
  input: z.object({}),
  output: z.object({}),
  errors: { Expired: z.object({}) },
  runs: 'server',
})
const SignIn = event({ payload: z.object({ name: z.string() }) })
const door = machine({
  context: z.object({ name: z.string() }),
  initialContext: { name: '' },
  initial: 'out',
  states: ({ ctx }) => ({
    out: {
      on: [
        on(SignIn, {
          target: 'signing',
          assign: (e) => {
            ctx.name = e.name
          },
        }),
      ],
    },
    signing: {
      invoke: invoke(signIn, {
        input: { name: ctx.name },
        done: 'welcome',
        failed: { Invalid: 'out', Unexpected: 'out' },
      }),
    },
    welcome: {},
  }),
})
const Door = ui.view({
  machine: door,
  render: ({ when }) =>
    ui.main({}, [
      when(
        ['out'],
        [
          ui.form({ on: { submit: ui.send(SignIn, { name: ui.dom.form('name') }) } }, [
            ui.input({ name: 'name' }),
            ui.button({ type: 'submit' }, ['Sign in']),
          ]),
        ],
      ),
      ui.query(
        who,
        {},
        { ready: (w) => ui.p({ class: 'who' }, [w]), failed: { Unexpected: () => ui.p({}, ['?']) } },
      ),
    ]),
})
const home = route({ path: '/', params: null, search: null })
const app = project({
  schema: zodAdapter,
  session: Session,
  routes: { home },
  pages: [ui.page(home, { views: [Door], head: { render: () => ({ title: 'Door' }) } })],
  features: [
    feature({
      id: 's',
      intent: { summary: 'ADR 0043 B sessions' },
      declarations: [{ aTag, bTag, who, listA, listB, touchA, signIn, expire, SignIn, door, Door }],
    }),
  ],
})
const build = buildProject(app, { sources: false })

function setup(env: Record<string, string> = {}) {
  const store = memorySessions({ secret: 'x'.repeat(40), secure: false })
  const runs: string[] = []
  const handler = createHandler({
    build,
    session: store,
    csp: false,
    env,
    resolvers: resolvers(app, (implement) => [
      implement(who, (_, { session }) => {
        runs.push('who')
        return session?.user ?? 'nobody'
      }),
      implement(listA, () => {
        runs.push('listA')
        return 1
      }),
      implement(listB, () => {
        runs.push('listB')
        return 2
      }),
      implement(touchA, () => ({})),
      implement(signIn, ({ name }, { setSession }) => {
        setSession({ user: name })
        return {}
      }),
      implement(expire, (_, { setSession, fail }) => {
        setSession(null)
        return fail('Expired', {})
      }),
    ]),
  })
  const effect = (name: string, input: unknown, keys: string[], cookie = '') =>
    handler.fetch(
      new Request(`${origin}/_hozu/effect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', cookie },
        body: JSON.stringify({ effect: `s.${name}`, input, keys }),
      }),
    )
  return { handler, store, runs, effect }
}

describe('ADR 0043 B: a session change is a barrier', () => {
  it("recomputes every 'request' key plus the keys whose tags were invalidated, and nothing else", async () => {
    const { effect, runs } = setup()
    const res = await effect('touchA', {}, ['s.who{}', 's.listA{}', 's.listB{}'])
    const body = (await res.json()) as { refreshed: [string, unknown][]; session?: true }
    expect(body.refreshed.map(([k]) => k)).toEqual(['s.who{}', 's.listA{}'])
    expect(runs).toEqual(['who', 'listA'])
    expect(body.session).toBeUndefined()
  })

  it('derives session: true when setSession ran, also in a failing mutation, and reads with the new session', async () => {
    const { effect, store } = setup()
    const signed = await effect('signIn', { name: 'zed' }, ['s.who{}'])
    expect(await signed.json()).toEqual({
      result: { ok: true, value: {} },
      refreshed: [['s.who{}', { ok: true, value: 'zed' }]],
      session: true,
    })
    const cookie = await store.issue({ user: 'ann' })
    const expired = await effect('expire', {}, ['s.who{}'], cookie)
    expect(await expired.json()).toEqual({
      result: { ok: false, error: 'Expired', data: {} },
      refreshed: [['s.who{}', { ok: true, value: 'nobody' }]],
      session: true,
    })
    expect(expired.headers.get('set-cookie')).toMatch(/^sid=; /)
  })

  it('a native form post renders the next page with the new session', async () => {
    const { handler } = setup()
    const html = await (await handler.fetch(new Request(`${origin}/`))).text()
    const action = /<form[^>]*action="([^"]+)"/.exec(html)![1]!.replace(/&amp;/g, '&')
    const res = await handler.fetch(
      new Request(new URL(action, origin), {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin,
          'sec-fetch-site': 'same-origin',
        },
        body: 'name=zed',
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/^sid=[\w-]+\.[\w-]+; /)
    expect(await res.text()).toContain('<p class="who">zed</p>')
  })

  it('sends a live connection only the tags its page subscribed to', async () => {
    const { handler, effect } = setup()
    const open = async (tag: string) => {
      const reader = (await handler.fetch(new Request(`${origin}/_hozu/live?tag=${tag}`))).body!.getReader()
      await reader.read()
      return reader
    }
    const a = await open('s.aTag')
    const b = await open('s.bTag')
    await effect('touchA', {}, [])
    expect(new TextDecoder().decode((await a.read()).value)).toBe('data: ["s.aTag"]\n\n')
    const quiet = await Promise.race([
      b.read().then(() => 'message'),
      new Promise((r) => setTimeout(() => r('quiet'), 30)),
    ])
    expect(quiet).toBe('quiet')
    await a.cancel()
    await b.cancel()
  })

  it('refuses to start in production without SESSION_SECRET unless a store is passed', () => {
    const options = { build, csp: false as const, resolvers: resolvers(app, () => []) }
    expect(() => createHandler({ ...options, env: { NODE_ENV: 'production' } })).toThrow(/SESSION_SECRET/)
    expect(() =>
      createHandler({ ...options, env: { NODE_ENV: 'production', SESSION_SECRET: 'y'.repeat(40) } }),
    ).toThrow(/HZ021|no implementation/)
  })
})
