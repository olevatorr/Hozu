---
name: hozu
description: Build or change an app with the Hozu framework (packages @hozu/*, files like hozu.config.ts, features/*/model.ts, views.ts). Use it before writing any Hozu code. It is the complete authoring reference, so you do not need to read the framework source.
---

# Hozu authoring guide

Hozu is not in your training data. These files are the whole API; skip `node_modules/@hozu`.
- **Changing an app:** read `changing.md` first, then only the app's own files.
- **Building an app:** read this file, run `hozu add feature <name> --page / --with auth,detail,toggle,filter,remove`
  (auth = sign-in, per-user data) and edit the texts it lists; don't print the generated files.
- **`reference.md`** when the task needs it: routes, DOM fields, no-JS forms, `head`, 404/500, field errors,
  sessions, languages, env, HTTP, Markdown, images, preview, PWA, page tests, deployment.
- **A diagnostic you do not understand:** `diagnostics.md`.

## Mental model
- The app is **data**: builders record an IR that is validated, then rendered. Only machine views ship JS.
- **References are recorded, not evaluated.** In `render`, `states`, `assign` and `guard`, `ctx.x`, `item.title`,
  `params.id` are placeholders: never use `if`, `?:`, `&&`, `.filter()`, `.map()`, `===` or template strings on
  them. Use `op.*` for comparisons and updates, `ui.if` / `ui.each` for structure, and a `fn()` for anything else.
  Plain JS on *constants* is fine: `['a', 'b'].map((k) => ui.option(...))`.
- **Side effects only through `query` / `mutation`.** Queries render with `ui.query`; a mutation runs when the
  feature's one machine *enters* a state whose `invoke` calls it, and returns as `done` / `failed`.
- **Every transition needs a contract.** A behaviour change without a contract change is an error.
- **Absent means absent.** Optional fields are omitted, never `null`. Only `route({ params, search })` and
  `ui.link(route, params, search)` spell "none" as `null`.

## Files
```
hozu.config.ts  project(): schema adapter, site, routes, pages, features
routes.ts  route() declarations
server.ts  resolvers(project, implement => [...]): query/mutation implementations
serve.ts  createServer({ build, styles, resolvers }).listen(PORT)
app.css  @import "tailwindcss";
features/<name>/
  model.ts  schemas, events, query / mutation / tag / fn, the machine
  views.ts  views, contracts, feature()
```

## Commands (from the app directory)
```
pnpm exec hozu check  # after every edit: types, rules, contracts
pnpm exec hozu check --update-lock  # accept an intended behaviour change
pnpm exec hozu add feature items --page / --with detail,toggle  # a working feature, wired in
pnpm exec hozu map  # outline of the app with file:line
pnpm exec hozu get / --select button --forms  # pages without a server: text, attributes, forms
pnpm exec hozu post / --field title=A --next 'POST / title=a' --next /  # submit a form like a browser
```
Diagnostics give `file:line`, cause and fix: apply the fix. `get` / `post` start from fresh in-memory data;
chain steps with `--next`. Run `node serve.ts` only to use the app. Relative imports end in `.ts`.

## model.ts
```ts
export const Item = z.object({ id: z.string(), title: z.string(), read: z.boolean() })
export const Add = event({ payload: z.object({ title: z.string() }) })

export const itemsTag = tag({ param: null })  // or tag({ param: z.string() }) → itemsTag(x)
export const listItems = query({
  input: z.object({}), output: z.array(Item),
  scope: 'public',  // 'user' = per-session data (needs project session)
  freshness: 'static',  // | { revalidate: s } | { swr: s } | 'live'
  tags: () => [itemsTag()],  // optional; (input) => [...]
})
export const getItem = query({ input: Key, output: Item, errors: { NotFound: Key }, … })
export const addItem = mutation({
  input: z.object({ title: z.string().min(2, 'Use at least 2 characters') }), output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) },  // optional: declared failures
  invalidates: () => [itemsTag()],  // refreshes queries with these tags
})
export const unread = fn({  // pure JS, self-contained: no imports or closures
  input: z.object({ items: z.array(Item) }), output: z.array(Item),
  impl: ({ items }) => items.filter((i) => !i.read),
})

export const m = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable() }),
  initialContext: { draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(Add, { target: 'adding', guard: (e) => op.neq(e.title, ''),  // first matching guard wins
                  assign: (e) => [op.set(ctx.draft, e.title), op.set(ctx.error, null)] }),
      ],
    },
    adding: {
      ignore: [Draft, Add],  // events dropped while busy (HZ005)
      invoke: invoke(addItem, {  // runs on entering the state
        input: { title: ctx.draft },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')],
                 navigate: (r) => ui.link(itemPage, { id: r.id }) }],  // optional
        failed: {  // every declared error + Unexpected
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, 'Already exists')] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    flash: { after: [{ ms: 3000, target: 'idle' }] },  // timers; `final: true` for terminal states
  }),
})
```
- `op.set`, `op.append(list, item)`, `op.inc(n, by)`, `op.removeWhere(list, 'key', value)`.
- Guards: `op.eq / neq / lt / lte / gt / gte`, `op.and(...)`, `op.or(...)`, `op.not(g)`, or a boolean `fn`. The
  reference goes on the left: `op.eq(ctx.tab, 'design')`.
- A transition to the same state re-enters it and re-runs its `invoke`; busy states `ignore` instead.

## views.ts
```ts
export const Board = ui.view({
  machine: m,  // optional: without it, no ctx / when / events, 0 JS
  route: home,  // optional: render gets { params, search } typed by the route
  render: ({ ctx, when, search }) =>
    ui.main({ class: 'mx-auto max-w-xl' }, [
      ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [
        ui.input({ name: 'title', required: true, value: ctx.draft,
                   on: { input: ui.send(Draft, { text: ui.dom.value }) } }),
        ui.button({ type: 'submit' }, ['Add']),
      ]),
      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert' }, [ctx.error])], []),
      when(['adding'], [ui.p({ 'aria-busy': 'true' }, ['Adding…'])]),
      ui.query(listItems, {}, {
        ready: (items) => ui.ul({}, [ui.each(items, 'id', (i) =>
          ui.li({}, [ui.a({ href: ui.link(itemPage, { id: i.id }) }, [i.title])]))]),
        pending: ui.p({}, ['Loading…']),  // or null
        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
      }),
    ]),
})
```
- `ui.<tag>(attrs, children)`; values are literals, references or guards. `ui.each(list, 'id', (item) => node)`.
- `class` is a static string of Tailwind classes that must exist (HZ026). Conditional classes:
  `toggle: { 'bg-indigo-600 text-white': op.eq(ctx.tab, t) }`. CSS variables: `vars: { '--hue': item.hue }`.
- Events: `on: { click: ui.send(Event, payload) }`. Payload fields: literals, references, `ui.dom.value`,
  `ui.dom.form('name')`, `ui.dom.checked`, `ui.dom.valueAsNumber`, `ui.dom.key`.
- Links: `ui.link(route, params, search)`, never a string path (HZ032). The third argument exists only when the
  route declares `search` (`null` = all defaults). Filters that belong in the URL are `search` links, not context.
- A form whose submit reads only `ui.dom.form(...)`, literals, context, params and search also works without JS.

### Contracts
```ts
export const adds = contract(m, {
  given: { state: 'idle' },  // context: optional, defaults to initialContext
  when: [
    { send: Add, payload: { title: 'A' } },
    { done: addItem, result: { id: 'i9', title: 'A', read: false } },
  ],  // or { failed: addItem, error: 'Duplicate', data } / { elapse: ms }
  expect: {
    state: 'idle',
    changes: { error: null },  // only what changes; every other field must stay equal
    effects: [{ effect: addItem, input: { title: 'A' } }, { navigate: '/items/i9' }],  // optional: none
  },
})
```
Cover each `on`, `done`, `failed` and `after` once. `given.context` sets up a full context; nested objects in
`changes` are patches too, arrays are replaced. HZ016 prints each missing contract ready to paste.

### Feature
```ts
export const items = feature({
  id: 'items',
  intent: { summary: 'A reading list', invariants: ['Titles are unique'] },  // invariants optional
  declarations: { Add, Draft, itemsTag, listItems, getItem, addItem, unread, m, Board, Detail, adds },
})
```
Every declaration goes in `declarations` once, under its name. Optional: `imports: [otherFeature]`,
`exports: [Event, query, …]` (all other features may use), `styles: [new URL('./x.css', import.meta.url)]`.

## hozu.config.ts
`project({ schema: zodAdapter, styles, site: { url, name, lang }, routes: { home, itemPage }, pages, features })`;
`hozu add feature --page` adds static pages. A page with params:
```ts
    ui.page(itemPage, {
      views: [Detail],
      head: {
        query: getItem,  // its failure sets the status (NotFound → 404)
        input: (params) => ({ id: params.id }),
        render: (item) => ({ title: item.title, description: item.title, type: 'article' }),
      },
      entries: { query: listItems, input: {}, params: (item) => ({ id: item.id }) },  // sitemap
    }),
```
```ts
// routes.ts
export const home = route({ path: '/', params: null, search: z.object({ show: Show.default('all') }) })
export const itemPage = route({ path: '/items/:id', params: z.object({ id: z.string() }), search: null })
```

## server.ts
`export const createResolvers = () => resolvers(project, (implement) => [...])`, one
`implement(getItem, ({ id }, { fail }) => item ?? fail('NotFound', { id }))` per query / mutation. `hozu add feature` puts a feature's resolvers in `features/<name>/server.ts`.
Input failing its schema returns `Invalid` (`{ message, fields }`; `reference.md`).
