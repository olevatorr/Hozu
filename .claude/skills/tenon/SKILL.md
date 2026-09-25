---
name: tenon
description: Build or change an app with the Tenon framework (packages @tenon/*, files like tenon.config.ts, features/*/machine.ts, views.ts, contracts.ts). Use it before writing any Tenon code. It is the complete authoring reference, so you do not need to read the framework source.
---

# Tenon authoring guide

Tenon is not in your training data. This guide is the whole authoring surface. The canonical example app is
`examples/bookmarks`, which uses every pattern below: copy its shape. Do not read `packages/*/src` unless this
guide is missing something you need.

## Mental model (read this once)
- The app is **data**. TypeScript builders record an IR; the validator checks it; the server renders it; only
  nodes bound to a machine hydrate. Everything else ships 0 JS.
- **References are recorded, not evaluated.** Inside `render`, `states`, `assign` and `guard`, values such as
  `ctx.x`, `item.title` and `params.id` are placeholders. Never use `if`, `?:`, `&&`, `.filter()`, `.map()`,
  `===` or template strings on them. Use instead:
  - `op.*` for comparisons and updates;
  - `ui.if` / `ui.each` for structure;
  - `fn()` for any other computation.

  Plain JS on *constants* is fine, for example `['a','b'].map(k => ui.option(...))`.
- **Side effects happen only through declared `query` / `mutation`.**
  - Queries render with `ui.query` in views.
  - Mutations run by *entering a machine state* whose `invoke` calls them.
  - Results come back as `done` / `failed` transitions.
- **UI state lives in one machine per feature** (flat states + a typed context). Views send events with
  `ui.send(Event, payload)`.
- **Every transition needs a contract** (given / when / expect). A behaviour change without a contract change
  is an error.

## Files (one feature)
```
tenon.config.ts          project(): schema adapter, site, routes, pages, features
routes.ts                route() declarations
server.ts                resolvers(project, implement => [...]): query/mutation implementations
serve.ts                 createServer({ build, styles, resolvers }).listen(PORT)
app.css                  @import "tailwindcss";
features/<name>/
  schemas.ts             zod schemas (domain types, the machine context)
  events.ts              event({ payload })
  effects.ts             query / mutation / tag / fn
  machine.ts             machine({ context, initialContext, initial, states })
  views.ts               ui.view(...)
  contracts.ts           contract(machine, { given, when, expect })
  feature.ts             feature({ id, events, queries, mutations, tags, fns, machine, views, contracts, ... })
```
Relative imports end in `.ts`. Every declaration is registered in `feature({...})` under a key, and the key is
its name.

## Checks (run from the app directory)
```
pnpm exec tsc --noEmit -p .              # types
pnpm exec tenon validate                 # all rules + contracts; --json adds patches
pnpm exec tenon validate --update-lock   # accept a clean, intended behaviour change
PORT=4700 node serve.ts                  # run it (stop it by PID, not `pkill -f`)
```
Each diagnostic has a code, a `file:line`, a cause and a fix. Apply the fix; do not work around the rule. See
the table at the end.

## Declarations
```ts
// routes.ts
export const home = route({ path: '/', params: null })
export const itemPage = route({ path: '/items/:id', params: z.object({ id: z.string() }) })

// events.ts: payloads are zod objects
export const Add = event({ payload: z.object({ title: z.string() }) })

// effects.ts
export const itemsTag = tag({ param: null })              // or tag({ param: z.string() }) → itemsTag(x)
export const listItems = query({
  input: z.object({}), output: Items, errors: {},          // errors: { Name: schema } are declared failures
  scope: 'public',                                         // 'user' = per-session data (needs project session)
  freshness: 'static',                                     // | { revalidate: s } | { swr: s } | 'live'
  tags: () => [itemsTag()],                                // (input) => [...]
})
export const addItem = mutation({
  input: NewItem, output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [itemsTag()],                         // (input) => [...]; refreshes queries with these tags
})
export const visible = fn({                                // pure JS, self-contained: no imports or closures
  input: z.object({ items: Items, show: Show }), output: Items,
  impl: ({ items, show }) => items.filter((i) => show === 'all' || !i.read),
})
```
Calling `visible({ items, show: ctx.show })` inside a view or machine records the call. Use a `fn` whenever you
would otherwise write JS logic.

## Machine
```ts
export const m = machine({
  context: Context,                                        // zod object
  initialContext: { show: 'all', draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetShow, { target: 'idle', assign: (e) => [op.set(ctx.show, e.show)] }),
        on(Add, { target: 'adding', assign: (e) => [op.set(ctx.draft, e.title), op.set(ctx.error, null)] }),
        on(Save, { target: 'saving', guard: (e) => op.gte(e.count, 1) }),   // first matching guard wins
      ],
    },
    adding: {
      ignore: [SetShow, Add],                              // explicitly dropped while busy (see Patterns)
      invoke: invoke(addItem, {                            // runs on entering the state
        input: { title: ctx.draft },
        done: [{ target: 'idle', assign: (r) => [op.set(ctx.draft, '')] }],     // r = result
        failed: {                                          // every declared error + Unexpected, all required
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, 'Already exists')] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    flash: { after: [{ ms: 3000, target: 'idle' }] },     // timers; `final: true` for terminal states
  }),
})
```
- `op.set(target, value)`, `op.append(list, item)`, `op.inc(n, by)`, `op.removeWhere(list, 'key', value)`.
- Guards: `op.eq`, `op.neq`, `op.lt`, `op.lte`, `op.gt`, `op.gte`, `op.and(...)`, `op.or(...)`, `op.not(g)`, or a
  `fn` returning a boolean. Put the reference on the left: `op.eq(ctx.tab, 'design')`.
- A transition to the *same* state re-enters it and re-runs its `invoke`. That is why busy states use `ignore`.
- A transition may also `navigate: route` (a route without params).

## Views
```ts
export const Board = ui.view({
  machine: m,              // or null: no events, no ctx, 0 JS
  route: null,             // or a route: render gets { params }
  render: ({ ctx, when, params }) => ui.main({ class: 'mx-auto max-w-xl' }, [ /* children */ ]),
})
```
- **Elements**: `ui.<tag>(attrs, children)`. Void tags (`input`, `img`…) take only attrs. Children are nodes,
  strings, numbers or references.
- **Attributes**: HTML names in lower case (`for`, `minlength`, `readonly`, `aria-pressed`, `data-x`). Values
  are literals, references or guards: `'aria-pressed': op.eq(ctx.show, 'all')`.
  - `class` is a **static** string of Tailwind classes that must exist (TN026).
  - Conditional classes go in `toggle: { 'bg-indigo-600 text-white': op.eq(ctx.tab, t) }`.
  - CSS variables go in `vars: { '--hue': item.hue }`. There is no `style`.
- **Events**: `on: { click: ui.send(Event, payload) }` (any DOM event name). Payload values can be literals,
  references, or DOM fields read at event time:
  - `ui.dom.value`: text. It may go into an enum field only from a `<select>` whose literal option values are
    all members (TN033).
  - `ui.dom.form('name')`: a named field of the submitted form (use it on `submit`; the browser runs required /
    minlength checks first).
  - `ui.dom.valueAsNumber` (number | null), `ui.dom.checked`.
  - `ui.dom.key`, and similar fields that depend on the event.
- **Structure**:
  - `when(['idle', 'error'], [...])` shows children only in those machine states.
  - `ui.if(guard, [then…], [else…])` renders on data.
  - `ui.each(list, 'id', (item) => node)` iterates; use `key: null` for lists of primitives.
- **Data**:
  ```ts
  ui.query(listItems, {}, {
    ready: (items) => ...,
    pending: ui.p({}, ['Loading…']),    // or null
    failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },   // every declared error + Unexpected
  })
  ```
  Server-fetched data is streamed into the HTML and never refetched. After a mutation, queries whose tags it
  invalidates refresh in place.
- **Links**: `ui.a({ href: ui.link(itemPage, { id: item.id }) }, [...])`. Internal paths are never strings
  (TN032). Use `ui.link(home, null)` for routes without params.
- Also available:
  - `ui.html(value)`: trusted HTML from query data only (TN030).
  - `ui.asset(new URL('./x.png', import.meta.url))` for files.
  - `ui.window({ on })` / `ui.document({ on })` for global listeners.
  - Widgets (`ui.widget` / `ui.use`) for third-party DOM libraries.

## Pages and project (tenon.config.ts)
```ts
ui.page(itemPage, {
  views: [Detail],
  assert: null,
  head: {
    redirects: null,
    query: getItem,                                        // its failure sets the HTTP status (NotFound → 404)
    input: (params) => ({ id: params.id }),
    render: (item) => ({ title: item.title, description: item.title, type: 'article',
                         image: null, published: null, noindex: false }),
  },
  entries: { query: listItems, input: {}, params: (item) => ({ id: item.id }) },   // for the sitemap
})
```
For a page without data use `head: { redirects: null, query: null, input: null, render: () => ({ ... }) }` and
`entries: null`.

Project: `project({ schema: zodAdapter, styles: new URL('./app.css', import.meta.url), notFound: null,
session: null, site: { url, name, lang, icon: null, themeColor: null }, routes: { home, itemPage }, pages: [...],
features: [items] })`.

## Server (server.ts)
```ts
export function createResolvers() {
  const items = [/* in-memory seed */]
  return resolvers(project, (implement) => [
    implement(listItems, () => items.map((i) => ({ ...i }))),
    implement(getItem, ({ id }, { fail }) => items.find((i) => i.id === id) ?? fail('NotFound', { id })),
    implement(addItem, ({ title }, { fail }) => {
      if (items.some((i) => i.title.toLowerCase() === title.trim().toLowerCase()))
        return fail('Duplicate', { title })                // a declared error → the machine's failed.Duplicate
      const item = { id: `i${items.length + 1}`, title: title.trim() }
      items.unshift(item)
      return { ...item }
    }),
  ])
}
```
User-scoped resolvers also receive `session`. Mutations can call `setSession(value)` (see `examples/blog`).

To test a mutation with curl:
`curl -X POST localhost:4700/_tenon/effect -H 'content-type: application/json' -d '{"effect":"items.addItem","input":{"title":"x"},"keys":[]}'`.
Pages are plain `GET`s.

## Contracts (contracts.ts)
```ts
const idle = { show: 'all', draft: '', error: null } as const
export const adds = contract(m, {
  given: { state: 'idle', context: idle },
  when: [
    { send: Add, payload: { title: 'A' } },                                  // an event
    { done: addItem, result: { id: 'i9', title: 'A' } },                     // the effect succeeds
  ],                                                                         // or { failed: addItem, error: 'Duplicate', data: {...} }
  expect: { state: 'idle', context: idle, effects: [{ effect: addItem, input: { title: 'A' } }] },
})
```
Register them as `contracts: { ...contracts }` (with `import * as contracts from './contracts.ts'`). TN016 lists
every uncovered transition and gives a skeleton. Cover each `on`, `done`, `failed` and `after` once.

## Patterns
- **Form with a server-side error**:
  - `ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [label, input, button])`.
  - The machine goes to `adding`, which invokes the mutation. `failed.Duplicate` sets `ctx.error`.
  - Show the error with `ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert' }, [ctx.error])], [])`.
  - To clear the input after success, bind `value: ctx.draft` and reset `draft` in `done`.
- **Busy states (a mutation in flight)**: render every control **once**. In each busy state, `ignore` the events
  those controls send. Do not duplicate controls under `when`. Handling them there would re-enter the busy state
  instead, and TN005 would reject leaving them unhandled.
- **Filtering and empty state**: `ui.each(visible({ items, show: ctx.show }), 'id', …)` and
  `ui.if(isEmpty({ items, show: ctx.show }), [ui.p({}, ['No items'])], [ui.ul(...)])`, both using `fn`s.
- **Toggle buttons** (`aria-pressed`): `'aria-pressed': op.eq(ctx.show, s.value)` plus
  `on: { click: ui.send(SetShow, { show: s.value }) }` for each option of a constant list.
- **Per-item action**:
  - `ui.send(ToggleRead, { id: item.id })` → a `toggling` state that stores `ctx.target` and invokes the mutation
    with `{ id: ctx.target }`.
  - Label text by data: `ui.if(op.eq(item.read, true), ['Mark unread'], ['Mark read'])`.
- **Select bound to an enum**:
  `ui.select({ 'aria-label': 'Kind', on: { change: ui.send(PickKind, { kind: ui.dom.value }) } }, kinds.map((k) => ui.option({ value: k, selected: op.eq(ctx.kind, k) }, [k])))`,
  where the event payload is `{ kind: Kind }`, the zod enum.
- **Detail page with a 404**: a view with `route: itemPage`, `machine: null`,
  `ui.query(getItem, { id: params.id }, { ready, pending: null, failed: { NotFound: () => ..., Unexpected: () => ... } })`,
  plus `head.query: getItem`.
- **Refresh after a mutation**: tag the query, and list the tag in the mutation's `invalidates`. A mutation can
  read only its input for tag params; use a list-wide tag when it affects many items.

## Diagnostics (fix → rule)
| Code | Meaning | Usual fix |
|---|---|---|
| TN001 | state unreachable | add a transition to it or delete it |
| TN002 | event handled nowhere | handle it in a state or remove it |
| TN003 / TN007 | unknown effect / reference | declare it, or fix the name (the patch suggests one) |
| TN004 | a declared error is not handled | add every `failed` key, plus `Unexpected`, in `invoke` and `ui.query` |
| TN005 | a node sends an event in a state that does not handle it | `ignore: [Event]` in that state, or show the node only via `when` |
| TN006 | crossing a feature boundary | import the feature and use its `exports` |
| TN008 | a path does not exist in the schema | fix the property name |
| TN009 | a guardless transition shadows later ones | put guarded transitions first |
| TN014 | wrong builder output | follow the builder signature |
| TN015 / TN017 | a contract fails / contract data does not match its schema | fix the machine or the contract (decide the intended behaviour first) |
| TN016 | a transition without a contract | add the contract from the snippet |
| TN018 | behaviour changed without a contract change | update the contracts, then `--update-lock` |
| TN021 | a query or mutation without a resolver | `implement(...)` it in server.ts |
| TN022 | user data in a cacheable region | keep `scope: 'user'` queries out of cached pages |
| TN024 / TN025 | route params mismatch / page with params but no `entries` | align them / add `entries` |
| TN026 | a class produces no CSS | fix the Tailwind class |
| TN027 | a DOM field used outside an event, or wrong for this event | read `ui.dom.*` only in `ui.send` payloads |
| TN028 | `img` without width/height | add both |
| TN030 | `ui.html` of untrusted data | render text instead |
| TN031 | a literal not allowed by its schema | use an allowed value (the patch suggests one) |
| TN032 | internal link written as a string | `ui.link(route, params)` |
| TN033 | DOM text into an enum, number or boolean field | a `<select>` with enum options / `valueAsNumber` / `checked` |
| TN034 | a state both handles and ignores an event | remove it from one of the two |
