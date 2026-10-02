import { planRoute } from '@hozu/compiler'
import { endpoint, feature, mutation, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Session = z.object({ user: z.string() })
const notesTag = tag({ param: null })
const Note = z.object({ id: z.string(), text: z.string() })
const listShared = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'user',
  freshness: 'request',
  tags: () => [notesTag()],
  runs: 'server',
})
const listPublic = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'public',
  freshness: 'static',
  tags: () => [notesTag()],
  runs: 'server',
})
const listLive = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'public',
  freshness: 'live',
  tags: () => [notesTag()],
  runs: 'server',
})
const addNote = mutation({
  input: z.object({ text: z.string() }),
  output: Note,
  errors: {},
  invalidates: () => [notesTag()],
  runs: 'server',
})
const p = project({
  schema: zodAdapter,
  session: Session,
  routes: {},
  pages: [],
  features: [
    feature({
      id: 'notes',
      intent: { summary: 'ADR 0043 data repro' },
      declarations: [{ notesTag, listShared, listPublic, listLive, addNote }],
    }),
  ],
})
const build = buildProject(p)
const ada = { user: 'ada' }
const bob = { user: 'bob' }
const texts = (r: unknown) => (r as { value: { text: string }[] }).value.map((n) => n.text)

function setup() {
  const store = [{ id: 'n1', text: 'Buy milk' }]
  const gates: (() => void)[] = []
  let gated = false
  const read = async () => {
    const snapshot = store.map((n) => ({ ...n }))
    if (gated) await new Promise<void>((r) => gates.push(r))
    return snapshot
  }
  const data = createDataRuntime({
    build,
    resolvers: resolvers(p, (implement) => [
      implement(listShared, read),
      implement(listPublic, read),
      implement(listLive, read),
      implement(addNote, ({ text }) => {
        const n = { id: `n${store.length + 1}`, text }
        store.unshift(n)
        return n
      }),
    ]),
  })
  const tick = () => new Promise((r) => setTimeout(r, 1))
  return {
    data,
    store,
    tick,
    gate: (on: boolean) => {
      gated = on
    },
    release: () => {
      for (const g of gates.splice(0)) g()
    },
  }
}

describe('ADR 0043 A (data)', () => {
  it("ADR 0043 D4a: another user's data reflects a mutation made by the writer", async () => {
    const { data } = setup()
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Buy milk'])
    await data.mutate(addNote, { text: 'Call Bob' }, ada)
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Call Bob', 'Buy milk'])
  })

  it('ADR 0043 D4c: revalidating a tag reaches user data', async () => {
    const { data, store } = setup()
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Buy milk'])
    store.unshift({ id: 'n2', text: 'Call Bob' })
    data.invalidate(['notes.notesTag'])
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Call Bob', 'Buy milk'])
  })

  it('ADR 0043 D4e: an invalidation during an in-flight read is not lost', async () => {
    const { data, gate, release, tick } = setup()
    gate(true)
    const first = data.query(listPublic, {})
    await tick()
    const write = await data.mutate(addNote, { text: 'Call Bob' }, ada)
    expect(write).toMatchObject({ ok: true, invalidated: ['notes.notesTag'] })
    release()
    await first
    gate(false)
    expect(texts(await data.query(listPublic, {}))).toEqual(['Call Bob', 'Buy milk'])
  })

  it('ADR 0043 D4f: a read started after a write never joins a pre-write in-flight read', async () => {
    const { data, gate, release, tick } = setup()
    gate(true)
    const before = data.query(listLive, {})
    await tick()
    await data.mutate(addNote, { text: 'Call Bob' }, ada)
    const after = data.query(listLive, {})
    await tick()
    release()
    await before
    release()
    expect(texts(await after)).toEqual(['Call Bob', 'Buy milk'])
  })

  it('ADR 0043 D4b: endpoint({ invalidates }) invalidates public entries, ISR pages and live tags', async () => {
    const { handler, store } = site()
    const page = async () => {
      const res = await handler.fetch(new Request(`${origin}/`))
      return [res.headers.get('x-hozu-cache'), (await res.text()).includes('Call Bob')]
    }
    expect(await page()).toEqual(['miss', false])
    expect(await page()).toEqual(['hit', false])
    const reader = (
      await handler.fetch(new Request(`${origin}/_hozu/live?tag=notes.notesTag`))
    ).body!.getReader()
    await reader.read()
    const hook = await handler.fetch(
      new Request(`${origin}/api/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Call Bob' }),
      }),
    )
    expect([hook.status, store[0]!.text]).toEqual([200, 'Call Bob'])
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: ["notes.notesTag"]\n\n')
    await reader.cancel()
    expect(await page()).toEqual(['miss', true])
  })

  it("ADR 0043 A: freshness 'request' on a public query derives mode request and an uncacheable page", async () => {
    const { handler, build: b } = site()
    const plan = planRoute(b.ir, 'now').plan
    expect(plan.cacheable).toBe(false)
    expect(plan.regions.find((r) => r.query === 'notes.clock')?.mode).toBe('request')
    const res = await handler.fetch(new Request(`${origin}/now`))
    expect([res.headers.get('x-hozu-cache'), res.headers.get('cache-control')]).toEqual([
      'bypass',
      'no-cache',
    ])
    const cached = await handler.fetch(new Request(`${origin}/`))
    expect(cached.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })
})

const origin = 'http://app.test'

function site() {
  const clock = query({
    input: z.object({}),
    output: z.number(),
    scope: 'public',
    freshness: 'request',
    runs: 'server',
  })
  const hook = endpoint({
    method: 'POST',
    path: '/api/notes',
    input: z.object({ text: z.string() }),
    output: z.object({ ok: z.boolean() }),
    invalidates: () => [notesTag()],
  })
  const List = ui.view({
    render: () =>
      ui.main({}, [
        ui.query(
          listPublic,
          {},
          {
            ready: (notes) => ui.ul({}, [ui.each(notes, 'id', (n) => ui.li({}, [n.text]))]),
            failed: { Unexpected: () => ui.p({}, ['error']) },
          },
        ),
      ]),
  })
  const Now = ui.view({
    render: () =>
      ui.main({}, [
        ui.query(clock, {}, { ready: (t) => ui.p({}, [t]), failed: { Unexpected: () => ui.p({}, ['?']) } }),
      ]),
  })
  const home = route({ path: '/', params: null, search: null })
  const now = route({ path: '/now', params: null, search: null })
  const app = project({
    schema: zodAdapter,
    site: { url: origin, name: 'Notes', lang: 'en' },
    routes: { home, now },
    pages: [
      ui.page(home, { views: [List], head: { render: () => ({ title: 'Notes' }) } }),
      ui.page(now, { views: [List, Now], head: { render: () => ({ title: 'Now' }) } }),
    ],
    features: [
      feature({
        id: 'notes',
        intent: { summary: 'ADR 0043 endpoint invalidation' },
        declarations: [{ notesTag, listPublic, clock, hook, List, Now }],
      }),
    ],
  })
  const store = [{ id: 'n1', text: 'Buy milk' }]
  const build = buildProject(app, { sources: false })
  const handler = createHandler({
    build,
    csp: false,
    resolvers: resolvers(app, (implement) => [
      implement(listPublic, () => store.map((n) => ({ ...n }))),
      implement(clock, () => 1),
      implement(hook, ({ text }) => {
        store.unshift({ id: `n${store.length + 1}`, text })
        return { ok: true }
      }),
    ]),
  })
  return { handler, store, build }
}
