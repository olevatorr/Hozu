// @vitest-environment happy-dom
import { event, feature, invoke, machine, mutation, on, project, query, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { type EffectResponse, hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const countTag = tag({ param: null })
const count = query({
  input: z.object({}),
  output: z.number(),
  scope: 'public',
  freshness: 'live',
  tags: () => [countTag()],
  runs: 'server',
})
const whoTag = tag({ param: null })
const who = query({
  input: z.object({}),
  output: z.string(),
  scope: 'user',
  freshness: 'request',
  tags: () => [whoTag()],
  runs: 'server',
})
const bump = mutation({
  input: z.object({}),
  output: z.object({}),
  invalidates: () => [whoTag()],
  runs: 'server',
})
const Bump = event({ payload: z.object({}) })
const counter = machine({
  context: z.object({}),
  initialContext: {},
  initial: 'idle',
  states: () => ({
    idle: { on: [on(Bump, { target: 'saving' })] },
    saving: {
      invoke: invoke(bump, { input: {}, done: 'idle', failed: { Unexpected: 'idle' } }),
    },
  }),
})
const Panel = ui.view({
  machine: counter,
  render: () =>
    ui.main({}, [
      ui.button({ type: 'button', on: { click: ui.send(Bump, {}) } }, ['Bump']),
      ui.query(
        count,
        {},
        { ready: (n) => ui.p({ class: 'count' }, [n]), failed: { Unexpected: () => ui.p({}, ['?']) } },
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
  session: z.object({ user: z.string() }),
  routes: { home },
  pages: [ui.page(home, { views: [Panel], head: { render: () => ({ title: 'Barrier' }) } })],
  features: [
    feature({
      id: 'b',
      intent: { summary: 'ADR 0043 B client barrier' },
      declarations: [{ countTag, whoTag, count, who, bump, Bump, counter, Panel }],
    }),
  ],
})
const build = buildProject(app, { sources: false })

async function page() {
  const data = createDataRuntime({
    build,
    resolvers: resolvers(app, (implement) => [
      implement(count, () => 1),
      implement(who, (_, { session }) => session?.user ?? 'nobody'),
      implement(bump, () => ({})),
    ]),
  })
  const { html } = await renderToString({ build, data, route: 'home', session: { user: 'ada' } })
  document.open()
  document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
  document.close()
  let finish: (r: EffectResponse) => void = () => {}
  let push: (tags: string[]) => void = () => {}
  const queried: string[] = []
  await hydrate(document, {
    loadFns: async () => ({}),
    transport: () => new Promise((r) => (finish = r)),
    query: async (q) => {
      queried.push(q)
      return q === 'b.count' ? { ok: true, value: 2 } : { ok: true, value: 'fresh' }
    },
    live: (onTags) => {
      push = onTags
    },
  })
  const click = () => document.querySelector('button')!.click()
  const text = (c: string) => document.querySelector(`p.${c}`)?.textContent
  return { finish: (r: EffectResponse) => finish(r), push: (t: string[]) => push(t), queried, click, text }
}

const settle = () => new Promise((r) => setTimeout(r, 10))

describe('ADR 0043 B: the client barrier', () => {
  it('queues tag messages while an effect is in flight and applies them after it', async () => {
    const p = await page()
    p.click()
    p.push(['b.countTag'])
    await settle()
    expect(p.queried).toEqual([])
    p.finish({ result: { ok: true, value: {} }, refreshed: [] })
    await settle()
    expect(p.queried).toEqual(['b.count'])
    expect(p.text('count')).toBe('2')
  })

  it('session: true drops the queue and replaces the store with the refreshed keys', async () => {
    const p = await page()
    expect([p.text('count'), p.text('who')]).toEqual(['1', 'ada'])
    p.click()
    p.push(['b.countTag'])
    p.finish({
      result: { ok: true, value: {} },
      refreshed: [['b.who{}', { ok: true, value: 'zed' }]],
      session: true,
    })
    await settle()
    expect(p.text('who')).toBe('zed')
    expect(p.queried).toEqual(['b.count'])
    expect(p.text('count')).toBe('2')
  })
})
