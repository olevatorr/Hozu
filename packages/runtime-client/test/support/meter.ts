import { contract, event, feature, machine, on, op, project, route, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'

export const Meter = ui.widget({
  tag: 'div',
  props: z.object({ value: z.number() }),
  events: { picked: z.object({ n: z.number() }) },
  client: new URL('./meter.client.ts', import.meta.url),
  load: 'eager',
  wraps: false,
})

export const Frame = ui.widget({
  tag: 'section',
  props: z.object({ tone: z.string() }),
  events: {},
  client: new URL('./frame.client.ts', import.meta.url),
  load: 'eager',
  wraps: true,
})

const Picked = event({ payload: z.object({ n: z.number() }) })
const Hide = event({ payload: z.object({}) })

const meter = machine({
  context: z.object({ count: z.number() }),
  initialContext: { count: 0 },
  initial: 'shown',
  states: ({ ctx }) => ({
    shown: {
      on: [
        on(Picked, { target: 'shown', assign: (p) => [op.set(ctx.count, p.n)] }),
        on(Hide, { target: 'hidden' }),
      ],
    },
    hidden: { final: true },
  }),
})

const Panel = ui.view({
  machine: meter,
  route: null,
  render: ({ ctx, when }) =>
    ui.main({}, [
      when(
        ['shown'],
        [
          ui.use(
            Meter,
            {
              props: { value: ctx.count },
              on: { picked: (d) => ui.send(Picked, { n: d.n }) },
              class: 'h-8',
              toggle: { 'bg-red-500': op.gt(ctx.count, 1) },
            },
            [ui.span({}, ['Loading meter…'])],
          ),
          ui.button({ type: 'button', on: { click: ui.send(Hide, {}) } }, ['Hide']),
        ],
      ),
      ui.use(Frame, { props: { tone: 'calm' }, on: {} }, [ui.p({}, ['Count: ', ctx.count])]),
    ]),
})

const home = route({ path: '/', params: null, search: null })

export default project({
  schema: zodAdapter,
  styles: null,
  http: null,
  notFound: null,
  error: null,
  session: null,
  site: null,
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Panel],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Meter',
          description: 'Widget fixture',
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
      id: 'meter',
      styles: [],
      messages: null,
      widgets: { Meter, Frame },
      intent: { summary: 'Widget fixture', invariants: [] },
      imports: [],
      tags: {},
      events: { Picked, Hide },
      queries: {},
      mutations: {},
      fns: {},
      machine: meter,
      views: { Panel },
      contracts: {
        covers: contract(meter, {
          given: { state: 'shown', context: { count: 0 } },
          when: [
            { send: Picked, payload: { n: 2 } },
            { send: Hide, payload: {} },
          ],
          expect: { state: 'hidden', context: { count: 2 }, effects: [] },
        }),
      },
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})
