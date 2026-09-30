import { feature, mutation, project, query, tag } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
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
  freshness: 'static',
  tags: () => [notesTag()],
})
const listPublic = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'public',
  freshness: 'static',
  tags: () => [notesTag()],
})
const listLive = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'public',
  freshness: 'live',
  tags: () => [notesTag()],
})
const addNote = mutation({
  input: z.object({ text: z.string() }),
  output: Note,
  errors: {},
  invalidates: () => [notesTag()],
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
  it.fails("ADR 0043 D4a: another user's data reflects a mutation made by the writer", async () => {
    const { data } = setup()
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Buy milk'])
    await data.mutate(addNote, { text: 'Call Bob' }, ada)
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Call Bob', 'Buy milk'])
  })

  it.fails('ADR 0043 D4c: revalidating a tag reaches user data', async () => {
    const { data, store } = setup()
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Buy milk'])
    store.unshift({ id: 'n2', text: 'Call Bob' })
    data.invalidate(['notes.notesTag'])
    expect(texts(await data.query(listShared, {}, bob))).toEqual(['Call Bob', 'Buy milk'])
  })

  it.fails('ADR 0043 D4e: an invalidation during an in-flight read is not lost', async () => {
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

  it.fails('ADR 0043 D4f: a read started after a write never joins a pre-write in-flight read', async () => {
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

  it.todo('ADR 0043 D4b: endpoint({ invalidates }) invalidates public entries, ISR pages and live tags')
  it.todo("ADR 0043 A: freshness 'request' on a public query derives mode request and an uncacheable page")
})
