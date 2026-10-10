import { fileURLToPath } from 'node:url'
import { event, feature, fn, machine, on, project, query, route, ui } from '@hozu/core'
import { buildProject, locateNode } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const home = route({ path: '/', params: null, search: null })
const Item = z.object({ id: z.string(), title: z.string() })
const listItems = query({
  input: z.object({}),
  output: z.array(Item),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
const visible = fn({
  input: z.object({ items: z.array(Item), all: z.boolean() }),
  output: z.array(Item),
  impl: ({ items, all }) => (all ? items : items.slice(0, 3)),
})
const Ask = event({ payload: z.object({}) })
const Done = event({ payload: z.object({}) })
const m = machine({
  context: z.object({ all: z.boolean() }),
  initialContext: { all: true },
  initial: 'idle',
  on: () => [on(Ask, { target: 'confirming' })],
  states: () => ({
    idle: { on: [on(Done, { target: 'saved' })] },
    confirming: { on: [on(Done, { target: 'idle' })] },
    saved: {},
  }),
})
const View = ui.view({
  machine: m,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.button({ type: 'button', on: { click: ui.send(Ask, {}) } }, ['Remove']),
      ui.query(
        listItems,
        {},
        {
          ready: (items) =>
            ui.ul({}, [ui.each(visible({ items, all: ctx.all }), 'id', (t) => ui.li({}, [t.title]))]),
          failed: { Unexpected: () => ui.p({}, ['Unavailable']) },
        },
      ),
    ]),
})

const build = buildProject(
  project({
    schema: zodAdapter,
    routes: { home },
    pages: [ui.page(home, { views: [View], head: { render: () => ({ title: 'Items' }) } })],
    features: [
      feature({
        id: 'items',
        intent: { summary: 'ADR 0083 D2' },
        declarations: [{ listItems, visible, Ask, Done, m, View }],
      }),
    ],
  }),
)
const at = (pointer: string) => {
  const loc = build.sources[pointer]!
  return { file: loc.file.slice(root.length), line: loc.line, column: loc.column }
}
const nodes = Object.keys(build.nodes ?? {}).map((id) => locateNode(build, id, { root })!)

describe('locating behaviour and data (ADR 0083 D2)', () => {
  it('builds without errors', () => {
    expect(build.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('places every copy of a shared on at the shared entry', () => {
    const button = nodes.find((n) => n.tag === 'button')!
    const [click] = button.events
    expect(click!.event).toBe('items.Ask')
    expect(click!.transitions.map((t) => t.from)).toEqual(['idle', 'confirming', 'saved'])
    const shared = at('/features/items/machine/on/0')
    expect(shared.file).toBe('packages/core/test/locate.test.ts')
    expect(click!.transitions.map((t) => t.location)).toEqual([shared, shared, shared])
  })

  it('finds the query behind a list whose items pass through a fn', () => {
    const text = nodes.find((n) => n.kind === 'text' && n.source?.kind === 'data')!
    expect(text.source?.location).toEqual(at('/features/items/queries/listItems'))
  })
})
