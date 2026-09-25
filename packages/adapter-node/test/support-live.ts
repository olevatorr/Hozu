import { contract, event, feature, machine, on, op, project, query, route, tag, ui } from '@tenon/core'
import { resolvers } from '@tenon/data'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'

const Search = event({ payload: z.object({ q: z.string() }) })
export const clockTag = tag({ param: null })
export const search = query({
  input: z.object({ q: z.string() }),
  output: z.array(z.string()),
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})
export const clock = query({
  input: z.object({}),
  output: z.object({ tick: z.number() }),
  errors: {},
  scope: 'public',
  freshness: 'live',
  tags: () => [clockTag()],
})

const finder = machine({
  context: z.object({ q: z.string() }),
  initialContext: { q: '' },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: { on: [on(Search, { target: 'ready', assign: (s) => [op.set(ctx.q, s.q)] })] },
  }),
})

const Finder = ui.view({
  machine: finder,
  route: null,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.input({ name: 'q', value: ctx.q, on: { input: ui.send(Search, { q: ui.dom.value }) } }),
      ui.query(
        search,
        { q: ctx.q },
        {
          ready: (hits) => ui.ul({}, [ui.each(hits, null, (h) => ui.li({}, [h]))]),
          pending: ui.p({ class: 'pending' }, ['Searching…']),
          failed: { Unexpected: () => ui.p({}, ['Search failed']) },
        },
      ),
      ui.query(
        clock,
        {},
        {
          ready: (c) => ui.p({ class: 'tick' }, ['Tick ', c.tick]),
          pending: null,
          failed: { Unexpected: () => ui.p({}, ['No clock']) },
        },
      ),
    ]),
})

const home = route({ path: '/', params: null })

export const site = project({
  schema: zodAdapter,
  styles: null,
  notFound: null,
  session: null,
  site: null,
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Finder],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Live',
          description: 'Fixture',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
  ],
  features: [
    feature({
      id: 'finder',
      styles: [],
      widgets: {},
      intent: { summary: 'Client fetch and live fixture', invariants: [] },
      imports: [],
      tags: { clockTag },
      events: { Search },
      queries: { search, clock },
      mutations: {},
      fns: {},
      machine: finder,
      views: { Finder },
      contracts: {
        covers: contract(finder, {
          given: { state: 'ready', context: { q: '' } },
          when: [{ send: Search, payload: { q: 'x' } }],
          expect: { state: 'ready', context: { q: 'x' }, effects: [] },
        }),
      },
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})

export const liveResolvers = () => {
  let tick = 0
  const words = ['apple', 'apricot', 'banana', 'cherry']
  return {
    bump: () => ++tick,
    set: resolvers(site, (implement) => [
      implement(search, ({ q }) => words.filter((w) => w.startsWith(q))),
      implement(clock, () => ({ tick })),
    ]),
  }
}
