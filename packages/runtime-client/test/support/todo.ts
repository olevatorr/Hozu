import { contract, event, feature, fn, machine, on, op, project, route, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'

const Item = z.object({ id: z.string(), title: z.string() })
const Items = z.array(Item)
const Draft = event({ payload: z.object({ text: z.string() }) })
const Add = event({ payload: z.object({ title: z.string() }) })
const Remove = event({ payload: z.object({ id: z.string() }) })
const Reverse = event({ payload: z.object({}) })
const Key = event({ payload: z.object({ key: z.string(), shift: z.boolean() }) })
const reversed = fn({ input: Items, output: Items, impl: (items) => [...items].reverse() })

const todo = machine({
  context: z.object({ items: Items, draft: z.string(), lastKey: z.string() }),
  initialContext: {
    items: [
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Beta' },
    ],
    draft: '',
    lastKey: '',
  },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Draft, { target: 'ready', assign: (d) => [op.set(ctx.draft, d.text)] }),
        on(Add, {
          target: 'ready',
          guard: (a) => op.neq(a.title, ''),
          assign: (a) => [op.append(ctx.items, { id: a.title, title: a.title }), op.set(ctx.draft, '')],
        }),
        on(Remove, { target: 'ready', assign: (r) => [op.removeWhere(ctx.items, 'id', r.id)] }),
        on(Reverse, { target: 'ready', assign: () => [op.set(ctx.items, reversed(ctx.items))] }),
        on(Key, { target: 'ready', assign: (k) => [op.set(ctx.lastKey, k.key)] }),
      ],
    },
  }),
})

const Todo = ui.view({
  machine: todo,
  route: null,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [
        ui.input({
          name: 'title',
          value: ctx.draft,
          'aria-invalid': op.eq(ctx.draft, 'bad'),
          on: {
            input: ui.send(Draft, { text: ui.dom.value }),
            keydown: ui.send(Key, { key: ui.dom.key, shift: ui.dom.shiftKey }),
          },
        }),
        ui.button({ type: 'submit', disabled: op.eq(ctx.draft, '') }, ['Add']),
      ]),
      ui.textarea({ name: 'notes', value: ctx.draft }),
      ui.ul({}, [
        ui.each(
          ctx.items,
          'id',
          (item) =>
            ui.li({ 'data-id': item.id }, [
              item.title,
              ui.button({ type: 'button', on: { click: ui.send(Remove, { id: item.id }) } }, ['×']),
            ]),
          'list',
        ),
      ]),
      ui.button({ type: 'button', on: { click: ui.send(Reverse, {}) } }, ['Reverse']),
      ui.p({}, ['Last key: ', ctx.lastKey]),
      ui.svg({ viewBox: '0 0 10 10', width: 10, height: 10 }, [
        ui.circle({ cx: 5, cy: 5, r: 4, fill: 'red' }, []),
      ]),
    ]),
})

export const covers = [
  contract(todo, {
    given: { state: 'ready', context: { items: [], draft: '', lastKey: '' } },
    when: [
      { send: Draft, payload: { text: 'x' } },
      { send: Add, payload: { title: 'x' } },
      { send: Add, payload: { title: '' } },
      { send: Key, payload: { key: 'Enter', shift: false } },
      { send: Reverse, payload: {} },
      { send: Remove, payload: { id: 'x' } },
    ],
    expect: { state: 'ready', context: { items: [], draft: '', lastKey: 'Enter' }, effects: [] },
  }),
]

export const home = route({ path: '/', params: null, search: null })

export const todoFeature = feature({
  id: 'todo',
  styles: [],
  widgets: {},
  intent: { summary: 'Client runtime fixture', invariants: [] },
  imports: [],
  tags: {},
  events: { Draft, Add, Remove, Reverse, Key },
  queries: {},
  mutations: {},
  fns: { reversed },
  machine: todo,
  views: { Todo },
  contracts: { covers: covers[0]! },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})

export default project({
  schema: zodAdapter,
  styles: null,
  notFound: null,
  error: null,
  session: null,
  site: null,
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Todo],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Todo',
          description: 'Todo fixture',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
  ],
  features: [todoFeature],
})
