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
import { implement } from '@hozu/core/component'
import { zodAdapter } from '@hozu/schema-zod'
import { createTV } from '@hozu/variants'
import { z } from 'zod'

const Item = z.object({ sku: z.string(), qty: z.number() })
const Add = event({ payload: Item })
const save = mutation({
  input: Item,
  output: z.object({ id: z.string() }),
  errors: { Busy: z.object({}) },
  invalidates: () => [],
  runs: 'server',
  access: 'anyone',
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
  runs: 'server',
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

query({ input: Item, output: Item, scope: 'public', freshness: 'static', runs: 'server' })

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

const Gauge = ui.component({
  tag: 'div',
  props: z.object({ value: z.number() }),
  client: new URL('./gauge.client.ts', import.meta.url),
  load: 'eager',
  render: () => ui.div({}, []),
})

export const NoHandlers = ui.view({
  render: () =>
    ui.main({}, [
      ui.use(Gauge, { props: { value: 1 } }),
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

const buttonStyles = Object.assign(
  (_props?: { tone?: 'primary' | 'ghost'; size?: 'sm' | 'md'; class?: string }) => '',
  {
    variants: {
      tone: { primary: 'bg-indigo-600', ghost: 'text-slate-700' },
      size: { sm: 'px-2', md: 'px-4' },
    },
    defaultVariants: { tone: 'primary', size: 'md' },
    slots: { base: '', icon: 'size-4' },
  },
)
const Save = event({ payload: z.object({}) })

export const Button = ui.component({
  tag: 'button',
  styles: buttonStyles,
  props: z.object({
    type: z.enum(['button', 'submit']).default('button'),
    disabled: z.boolean().default(false),
  }),
  slots: ['icon'],
  children: true,
  events: ['press'],
  render: ({ props, slots, children, on, classes }) =>
    ui.button({ type: props.type, disabled: props.disabled, on: { click: on.press } }, [
      ui.span({ class: classes.icon }, [slots.icon]),
      ...children,
    ]),
})

export const Badge = ui.component({ tag: 'span', render: () => ui.span({}, []) })

const tv = createTV({})

export const Chip = ui.component({
  tag: 'span',
  styles: tv({ slots: { base: 'rounded', dot: 'size-2' }, variants: { tone: { on: 'bg-white', off: '' } } }),
  props: z.object({ label: z.string() }),
  render: ({ props, classes }) => ui.span({}, [ui.i({ class: classes.dot }, []), props.label]),
})

const Picker = ui.component({
  tag: 'div',
  props: z.object({ value: z.string() }),
  emits: { change: z.object({ value: z.string() }) },
  client: new URL('./picker.client.ts', import.meta.url),
  load: 'visible',
  render: () => ui.div({}, []),
})

export const kitUi = ui.kit({ id: 'ui', components: [{ Button, Badge, Chip }] })

export const Uses = ui.view({
  render: () =>
    ui.main({}, [
      ui.use(
        Button,
        {
          variant: { tone: 'ghost', size: 'sm' },
          props: { disabled: true },
          slots: { icon: ui.svg({ viewBox: '0 0 1 1' }, []) },
          on: { press: ui.send(Save, {}) },
          class: 'w-full bg-red-500!',
        },
        ['Save'],
      ),
      ui.use(Badge, {}),
      ui.use(Chip, { variant: { tone: 'on' }, props: { label: 'x' } }),
      // @ts-expect-error an inline tv() still types its variants
      ui.use(Chip, { variant: { tone: 'dim' }, props: { label: 'x' } }),
      ui.use(Picker, { props: { value: 'a' }, on: { change: () => ui.send(Save, {}) } }),
      // @ts-expect-error a literal variant outside its values
      ui.use(Button, { variant: { tone: 'danger' } }, []),
      // @ts-expect-error an unknown slot
      ui.use(Button, { slots: { label: 'x' } }, []),
      // @ts-expect-error an emits event takes (detail) => Send, not a Send
      ui.use(Picker, { props: { value: 'a' }, on: { change: ui.send(Save, {}) } }),
      // @ts-expect-error a required prop
      ui.use(Picker, {}),
      // @ts-expect-error a component without children takes no children
      ui.use(Badge, {}, ['x']),
      // @ts-expect-error an undeclared DOM event
      ui.use(Button, { on: { hover: ui.send(Save, {}) } }, []),
    ]),
})

// @ts-expect-error a client component declares when it loads
ui.component({
  tag: 'div',
  client: new URL('./picker.client.ts', import.meta.url),
  render: () => ui.div({}, []),
})

// @ts-expect-error emits belong to client components
ui.component({
  tag: 'div',
  emits: { change: z.object({}) },
  render: () => ui.div({}, []),
})

ui.component({
  tag: 'div',
  slots: ['icon'],
  // @ts-expect-error the render reads declared slots only
  render: ({ slots }) => ui.div({}, [slots.label]),
})

project({ schema: zodAdapter, routes: {}, pages: [], features: [], kits: [kitUi] })

export const pickerClient = implement<typeof Picker>(({ el, props, emit, signal }) => {
  const value: string = props.value
  emit('change', { value })
  // @ts-expect-error a client emits only the events it declares
  emit('chosen', { value })
  // @ts-expect-error the detail follows the emits schema
  emit('change', { value: 1 })
  el.addEventListener('click', () => emit('change', { value }), { signal })
  return {
    update(next) {
      next.value satisfies string
    },
  }
})

const OwnedNote = z.object({ id: z.string(), owner: z.string() })
export const ownedNotes = query({
  input: z.object({}),
  output: z.array(OwnedNote),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: { owner: { row: (n) => n.owner, session: (s) => s.user } },
})
export const misspelledOwner = query({
  input: z.object({}),
  output: z.array(OwnedNote),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  // @ts-expect-error the owner rule reads a field of the output row
  access: { owner: { row: (n) => n.ownr, session: (s) => s.user } },
})
// @ts-expect-error a server-run user query declares access (ADR 0056 B)
export const undeclared = query({
  input: z.object({}),
  output: z.array(OwnedNote),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
})
export const publicRead = query({
  input: z.object({}),
  output: z.array(OwnedNote),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
  // @ts-expect-error a public query never sees the session, so it takes no access
  access: 'signedIn',
})

// ADR 0057 C (0.15 dogfood): invoke passes what the schema takes in, so a coerced field accepts the form's text.
const addOrder = mutation({
  input: z.object({ amount: z.coerce.number() }),
  output: z.object({ id: z.string() }),
  runs: 'server',
  access: 'anyone',
})
export const orders = machine({
  context: z.object({ amount: z.string(), id: z.string() }),
  initialContext: { amount: '', id: '' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [] },
    adding: {
      invoke: invoke(addOrder, {
        input: { amount: ctx.amount },
        done: 'idle',
        failed: { Unexpected: 'idle' },
      }),
    },
  }),
})
