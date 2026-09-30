import {
  contract,
  event,
  feature,
  invoke,
  machine,
  mutation,
  on,
  project,
  query,
  route,
  ui,
} from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const Item = z.object({ sku: z.string(), qty: z.number() })
const Add = event({ payload: Item })
const save = mutation({
  input: Item,
  output: z.object({ id: z.string() }),
  errors: { Busy: z.object({}) },
  invalidates: () => [],
})
const Context = z.object({ items: z.array(Item), note: z.string().nullable() })

export const ok = machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Add, {
          target: 'saving',
          assign: (item) => {
            ctx.items.push(item)
          },
        }),
      ],
    },
    saving: {
      invoke: invoke(save, {
        input: { sku: 'a', qty: 1 },
        done: [
          {
            target: 'idle',
            assign: (r) => {
              ctx.note = r.id
            },
          },
        ],
        failed: {
          Busy: [{ target: 'idle' }],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.note = e.message
              },
            },
          ],
        },
      }),
    },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: () => ({
    // @ts-expect-error typo in a transition target
    idle: { on: [on(Add, { target: 'idel' })] },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  // @ts-expect-error typo in the initial state
  initial: 'idel',
  states: () => ({ idle: {} }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Add, {
          target: 'idle',
          assign: (item) => {
            // @ts-expect-error misspelled payload field
            ctx.note = item.skuu
          },
        }),
      ],
    },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Add, {
          target: 'idle',
          assign: (item) => {
            // @ts-expect-error wrong value type for a context path
            ctx.note = item.qty
          },
        }),
      ],
    },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: () => ({
    idle: {
      invoke: invoke(save, {
        input: { sku: 'a', qty: 1 },
        done: [{ target: 'idle' }],
        // @ts-expect-error declared error Busy is not handled
        failed: { Unexpected: [{ target: 'idle' }] },
      }),
    },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: () => ({
    idle: {
      // @ts-expect-error typo in a failed target
      invoke: invoke(save, {
        input: { sku: 'a', qty: 1 },
        done: [{ target: 'idle' }],
        failed: { Busy: [{ target: 'idle' }], Unexpected: [{ target: 'eror' }] },
      }),
    },
  }),
})

ui.view({
  machine: ok,
  render: ({ ctx, when }) =>
    ui.div({}, [
      // @ts-expect-error unknown state in when()
      when(['saving', 'done'], []),
      // @ts-expect-error payload does not match the event schema
      ui.button({ on: { click: ui.send(Add, { sku: 'a' }) } }, ['Add']),
      // @ts-expect-error each key must be a property of the items
      ui.each(ctx.items, 'id', (item) => ui.span({}, [item.sku])),
      // @ts-expect-error unknown context path
      ctx.missing,
    ]),
})

contract(ok, {
  // @ts-expect-error unknown state in a contract
  given: { state: 'waiting', context: { items: [], note: null } },
  when: [],
  expect: { state: 'idle' },
})

const slugRoute = route({ path: '/items/:slug', params: z.object({ slug: z.string() }), search: null })
const itemQuery = query({
  input: z.object({ slug: z.string() }),
  output: Item,
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})

ui.view({
  route: slugRoute, // @ts-expect-error unknown route param
  render: ({ params }) => ui.p({}, [params.slg]),
})

ui.page(slugRoute, {
  views: [],
  head: {
    query: itemQuery,
    input: (params) => ({ slug: params.slug }),
    render: (item) => ({
      // @ts-expect-error head fields read typed query data
      title: item.name,
      description: item.sku,
      type: 'article',
    }),
  },
})

const Typed = event({ payload: z.object({ text: z.string(), n: z.number().nullable() }) })
const Picked = event({ payload: z.object({ ids: z.array(z.string()), kinds: z.array(z.enum(['a', 'b'])) }) })
const picked = ui.formRef()

ui.view({
  render: () =>
    ui.form({ on: { submit: ui.send(Typed, { text: ui.dom.form('title'), n: null }) } }, [
      ui.input({
        name: 'title',
        on: { input: ui.send(Typed, { text: ui.dom.value, n: ui.dom.valueAsNumber }) },
      }),
      // @ts-expect-error attribute not defined for the tag
      ui.a({ href: '/', disabled: true }, []),
      // @ts-expect-error void elements take no children
      ui.img({ src: '/a.png', alt: '' }, []),
      // @ts-expect-error unknown DOM event
      ui.button({ on: { tap: ui.send(Typed, { text: '', n: null }) } }, []),
      // @ts-expect-error DOM field type must match the payload
      ui.input({ on: { input: ui.send(Typed, { text: ui.dom.checked, n: null }) } }),
      ui.form(
        {
          ref: picked,
          on: { submit: ui.send(Picked, { ids: ui.dom.formAll('ids'), kinds: ui.dom.formAll('k') }) },
        },
        [],
      ),
      ui.input({ type: 'checkbox', form: picked, name: 'ids', value: 'x' }),
      // @ts-expect-error formAll is a list, not one value
      ui.form({ on: { submit: ui.send(Typed, { text: ui.dom.formAll('title'), n: null }) } }, []),
      // @ts-expect-error form takes a ui.formRef(), not a string
      ui.input({ form: 'picked', name: 'ids' }),
      // @ts-expect-error ref belongs on a form
      ui.div({ ref: picked }, []),
      ui.svg({ viewBox: '0 0 1 1' }, [ui.path({ d: 'M0 0', 'stroke-width': 2 }, [])]),
      ui.button({ 'aria-pressed': ui.dom.key === 'x', 'data-state': 'open' }, []),
    ]),
})

query({ input: Item, output: Item, scope: 'public', freshness: 'static' })

// @ts-expect-error absent values are omitted, never null
project({ schema: zodAdapter, http: null, routes: {}, pages: [], features: [] })

// @ts-expect-error declarations are one record, not one record per kind
feature({ id: 'f', intent: { summary: 'x' }, declarations: [{}], events: {} })

contract(ok, {
  given: { state: 'idle' },
  when: [],
  // @ts-expect-error changes name context fields only
  expect: { state: 'idle', changes: { missing: 1 } },
})

contract(ok, {
  given: { state: 'idle' },
  when: [],
  // @ts-expect-error the unchecked null form is gone
  expect: { state: 'idle', effects: null },
})

contract(ok, {
  given: { state: 'idle', context: { note: 'draft' } },
  when: [],
  expect: { state: 'idle' },
})

contract(ok, {
  // @ts-expect-error a given patch names context fields only
  given: { state: 'idle', context: { missing: 1 } },
  when: [],
  expect: { state: 'idle' },
})

const Gauge = ui.widget({
  tag: 'div',
  props: z.object({ value: z.number() }),
  events: {},
  client: new URL('./gauge.client.ts', import.meta.url),
  load: 'eager',
  wraps: false,
})

export const NoHandlers = ui.view({
  render: () =>
    ui.main({}, [
      ui.use(Gauge, { props: { value: 1 } }, []),
      ui.query(itemQuery, { slug: 'a' }, { ready: () => null, failed: { Unexpected: () => null } }),
    ]),
})

const listing = route({
  path: '/list',
  params: null,
  search: z.object({ tag: z.string().default(''), page: z.number().default(1) }),
})
const plain = route({ path: '/plain', params: null, search: null })
export const links = [
  ui.link(listing, null),
  ui.link(listing, null, { tag: 'x' }),
  ui.link(listing, null, { tag: 'x', page: 2 }),
  ui.link(plain, null),
  // @ts-expect-error omit the search instead of passing null (ADR 0043 G)
  ui.link(listing, null, null),
  // @ts-expect-error an empty search is the omitted one
  ui.link(listing, null, {}),
  // @ts-expect-error a route without search takes no third argument
  ui.link(plain, null, { tag: 'x' }),
]
