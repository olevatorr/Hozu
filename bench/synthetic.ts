import { type EventDecl, event, type FeatureDecl, feature, machine, on, project, query, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const Payload = z.object({ n: z.number() })
const Context = z.object({ n: z.number(), label: z.string() })
const Rows = z.array(z.object({ id: z.string(), n: z.number() }))
const NoInput = z.object({})

const rowsQuery = () =>
  query({
    input: NoInput,
    output: Rows,
    scope: 'public',
    freshness: 'static',
    tags: () => [],
    runs: 'server',
  })

export function syntheticProject(features: number, states = 30, events = 10) {
  const decls: FeatureDecl[] = []
  let previous: { feature: FeatureDecl; rows: ReturnType<typeof rowsQuery> } | null = null
  for (let f = 0; f < features; f++) {
    const evs: EventDecl<{ n: number }>[] = Array.from({ length: events }, () => event({ payload: Payload }))
    const rows = query({
      input: NoInput,
      output: Rows,
      scope: 'public',
      freshness: 'static',
      tags: () => [],
      runs: 'server',
    })
    const names = Array.from({ length: states }, (_, s) => `s${s}`)
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 's0',
      states: ({ ctx }) =>
        Object.fromEntries(
          names.map((name, s) => [
            name,
            {
              on: [
                on(evs[s % events]!, {
                  target: names[(s + 1) % states]!,
                  assign: (p) => {
                    ctx.n = p.n
                  },
                }),
                on(evs[(s + 3) % events]!, {
                  target: names[(s + 7) % states]!,
                  guard: (p) => p.n > 0,
                  assign: (p) => {
                    ctx.n = p.n
                  },
                }),
              ],
            },
          ]),
        ) as never,
    })
    const source = previous?.rows ?? rows
    const View = ui.view({
      machine: m,
      render: ({ ctx, when }) =>
        ui.section({ class: 'grid' }, [
          ui.h2({}, ['Feature ', f]),
          ui.query(
            source,
            {},
            {
              ready: (items) =>
                ui.ul({}, [ui.each(items, 'id', (item) => ui.li({}, [item.id, ': ', item.n]))]),
              pending: null,
              failed: { Unexpected: () => ui.p({}, ['error']) },
            },
          ),
          when(['s0'], [ui.button({ on: { click: ui.send(evs[0]!, { n: 1 }) } }, ['Go'])]),
          ui.p({}, [ctx.label]),
        ]),
    })
    const eventRecord = Object.fromEntries(evs.map((e, i) => [`E${i}`, e]))
    const decl = feature({
      id: `f${f}`,
      intent: { summary: `Synthetic feature ${f}` },
      imports: previous ? [previous.feature] : [],
      declarations: [{ ...eventRecord, rows, View, m }],
      exports: [rows],
    })
    decls.push(decl)
    previous = { feature: decl, rows }
  }
  return project({ schema: zodAdapter, routes: {}, pages: [], features: decls })
}
