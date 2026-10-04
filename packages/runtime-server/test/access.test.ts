import { feature, mutation, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Note = z.object({ id: z.string(), owner: z.string(), text: z.string() })
const Key = z.object({ id: z.string() })
const notes = [
  { id: 'n1', owner: 'ada', text: 'Ada’s' },
  { id: 'n2', owner: 'bob', text: 'Bob’s' },
]

const mine = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: { owner: { row: (n) => n.owner, session: (s) => s.user } },
})
const everyone = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: { owner: { row: (n) => n.owner, session: (s) => s.user } },
})
const one = query({
  input: Key,
  output: Note,
  errors: { NotFound: Key },
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: { owner: { row: (n) => n.owner, session: (s) => s.user } },
})
const count = query({
  input: z.object({}),
  output: z.number(),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})
const audit = query({
  input: z.object({}),
  output: z.number(),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: { allow: ({ session }) => session.user === 'root' },
})
const edit = mutation({
  input: z.object({ id: z.string(), text: z.string() }),
  output: Note,
  runs: 'server',
  access: {
    owner: { load: one, input: (i) => ({ id: i.id }), row: (n) => n.owner, session: (s) => s.user },
  },
})
const post = mutation({
  input: z.object({ owner: z.string(), text: z.string() }),
  output: z.object({}),
  runs: 'server',
  access: { owner: { row: (i) => i.owner, session: (s) => s.user } },
})
const home = route({ path: '/', params: null, search: null })
const page = route({ path: '/notes/:id', params: Key, search: null })
const Home = ui.view({ render: () => ui.p({}, ['home']) })
const app = project({
  schema: zodAdapter,
  session: z.object({ user: z.string() }),
  routes: { home, page },
  pages: [
    ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } }),
    ui.page(page, {
      views: [Home],
      head: {
        query: one,
        input: (params) => ({ id: params.id }),
        render: (n) => ({ title: n.text }),
        failed: { NotFound: 404 },
      },
    }),
  ],
  features: [
    feature({
      id: 'a',
      intent: { summary: 'declared access (ADR 0056 B)' },
      declarations: [{ mine, everyone, one, count, audit, edit, post, Home }],
    }),
  ],
})
const ran: string[] = []
const build = buildProject(app, { sources: false })
const resolverSet = resolvers(app, (implement) => [
  implement(mine, (_, { session }) => notes.filter((n) => n.owner === session?.user)),
  implement(everyone, () => notes),
  implement(one, ({ id }, { fail }) => notes.find((n) => n.id === id) ?? fail('NotFound', { id })),
  implement(count, () => 1),
  implement(audit, () => 2),
  implement(edit, ({ id, text }) => {
    ran.push(id)
    return { ...notes.find((n) => n.id === id)!, text }
  }),
  implement(post, () => ({})),
])
const runtime = (env: Record<string, string> = {}) => {
  const errors: string[] = []
  const data = createDataRuntime({
    build,
    resolvers: resolverSet,
    env,
    onError: (e) => errors.push(e instanceof Error ? e.message : String(e)),
  })
  return { data, errors }
}
const ada = { user: 'ada' }
const forbidden = { ok: false, error: 'Forbidden', data: { message: 'Forbidden' } }

describe('declared access at run time (ADR 0056 B)', () => {
  it('builds clean: every server-run user query and mutation declares access', () => {
    expect([...build.diagnostics, ...validate(build.ir)].filter((d) => d.severity === 'error')).toEqual([])
    expect(build.ir.features.a!.queries.mine!.access).toEqual({
      kind: 'owner',
      row: { ref: 'result', path: ['owner'] },
      session: { ref: 'session', path: ['user'] },
      load: null,
    })
    expect(build.ir.features.a!.queries.audit!.access).toMatchObject({ kind: 'allow', test: { op: 'eq' } })
  })

  it("'signedIn' and allow refuse before the resolver runs", async () => {
    const { data } = runtime()
    expect(await data.query(count, {})).toEqual(forbidden)
    expect(await data.query(count, {}, ada)).toEqual({ ok: true, value: 1 })
    expect(await data.query(audit, {}, ada)).toEqual(forbidden)
    expect(await data.query(audit, {}, { user: 'root' })).toEqual({ ok: true, value: 2 })
  })

  it('owner: one row that is not the visitor’s is Forbidden; a scoped list passes', async () => {
    const { data } = runtime()
    expect(await data.query(one, { id: 'n1' }, ada)).toMatchObject({ ok: true, value: { id: 'n1' } })
    expect(await data.query(one, { id: 'n2' }, ada)).toEqual(forbidden)
    expect(await data.query(one, { id: 'n1' })).toEqual(forbidden)
    expect(await data.query(mine, {}, ada)).toEqual({ ok: true, value: [notes[0]] })
  })

  it('owner: a list with foreign rows is HZ091 in development, and dropped and logged once in production', async () => {
    const dev = runtime()
    const result = await dev.data.query(everyone, {}, ada)
    expect(result).toMatchObject({ ok: false, error: 'Unexpected' })
    expect(dev.errors[0]).toMatch(/^HZ091 a\.everyone returned 1 row the visitor does not own/)
    const prod = runtime({ NODE_ENV: 'production' })
    expect(await prod.data.query(everyone, {}, ada)).toEqual({ ok: true, value: [notes[0]] })
    await prod.data.query(everyone, {}, ada)
    expect(prod.errors).toHaveLength(1)
  })

  it('owner on a mutation: load reads the row first; without load the rule reads the input', async () => {
    const { data } = runtime()
    expect(await data.mutate(edit, { id: 'n1', text: 'x' }, ada)).toMatchObject({ ok: true })
    expect(await data.mutate(edit, { id: 'n2', text: 'x' }, ada)).toEqual({ ...forbidden, invalidated: [] })
    expect(await data.mutate(post, { owner: 'ada', text: 'x' }, ada)).toMatchObject({ ok: true })
    expect(await data.mutate(post, { owner: 'bob', text: 'x' }, ada)).toEqual({
      ...forbidden,
      invalidated: [],
    })
  })

  it('owner on a mutation fails closed: when load fails for any reason, the resolver does not run (0.15 dogfood)', async () => {
    const { data } = runtime()
    expect(await data.mutate(edit, { id: 'missing', text: 'x' }, ada)).toEqual({
      ...forbidden,
      invalidated: [],
    })
    expect(await data.mutate(edit, { id: 'missing', text: 'x' })).toEqual({ ...forbidden, invalidated: [] })
    expect(ran).not.toContain('missing')
  })

  it('a page whose head query is refused answers 403', async () => {
    const handler = createHandler({ build, resolvers: resolverSet, env: { SESSION_SECRET: 'x'.repeat(32) } })
    expect((await handler.fetch(new Request('http://localhost/notes/n2'))).status).toBe(403)
  })
})
