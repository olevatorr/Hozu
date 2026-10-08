# Recipes for common changes

Names follow `hozu add feature items`: `Item`, `NewItem`, `Add`, `addItem`, `itemsMachine`, `ItemsBoard`. The controls are plain elements; with a
kit, use its components instead. More recipes (an action over many items, a field on the detail page, a detail page): see --more.

## A personal list without sign-in (a watchlist, favourites)
The list is the visitor's own: it lives in their browser, so two visitors never share it (`examples/watchlist`).
- **model:** `myList` query `scope: 'user'`, `freshness: 'request'`, `tags: () => [listTag()]`, `runs: 'browser'`;
  `addSymbol` / `removeSymbol` mutations `invalidates: () => [listTag()]`, `runs: 'browser'` (no `access`).
- **fetch.ts:** `localStorage`, one export per effect:
  ```ts
  const read = (): string[] => JSON.parse(localStorage.getItem('watchlist:symbols') ?? '[]')
  export const myList = implement<typeof model.myList>(async () => read())
  export const addSymbol = implement<typeof model.addSymbol>(async ({ symbol }, { fail }) => {
    if (read().includes(symbol)) return fail('Duplicate', { symbol })
    localStorage.setItem('watchlist:symbols', JSON.stringify([...read(), symbol]))
    return {}
  })
  ```
- **feature.ts:** `fetch: new URL('./fetch.ts', import.meta.url)`; `app.ts`: `components: bundleComponents`.
- **Data about the items** (quotes, prices) is public: a `runs: 'server'` (or `'either'`) query inside the list's
  `ready` branch, `ui.query(quotes, { symbols }, …)`.
- Refresh controls (Pause / Resume / Refresh now): states `live` / `paused`, `refresh: () => [quotesTag()]` on
  `RefreshNow` and on `live`'s `after: [{ ms: 30_000, target: 'live', … }]`; adds return with `done: 'previous'`.
- **Ask the server before saving** (normalize "2330" to "2330.TW"): a `runs: 'server'` query `resolveSymbol`, then
  the browser mutation: `looking: { invoke: invoke(resolveSymbol, { input: { q: ctx.symbol }, done: { target:
  'saving', assign: (r) => { ctx.symbol = r.symbol } }, failed: { … target: 'previous' } }) }`, `saving: { invoke:
  invoke(addSymbol, { input: { symbol: ctx.symbol }, done: 'previous', … }) }`; `previous` skips both busy states.
- Across devices the list needs sign-in and a database instead (`hozu docs auth`).

## A field chosen in the add form (an enum)
- **model:**
  - `export const Priority = z.enum(['low', 'normal', 'high'])`;
  - add `priority: Priority` to `Item`, `NewItem` and the `Add` payload;
  - context: `priority: Priority`, with `priority: 'normal'` in `initialContext`;
  - `fields` gets `priority: z.string().nullable()`, with `priority: null` in `initialContext` and in the `Add`
    assign that resets it;
  - the `Add` assign also gets `ctx.priority = e.priority`, and the add `invoke` input becomes
    `{ title: ctx.draft, priority: ctx.priority }`.
- **views:**
  - the form's submit sends `{ title: ui.dom.form('title'), priority: ui.dom.form('priority') }`;
  - inside the form add
    `ui.select({ name: 'priority', 'aria-label': 'Priority', class: 'rounded border px-2' }, ['low', 'normal', 'high'].map((p) => ui.option({ value: p, selected: p === 'normal' }, [p])))`;
  - in the item: `ui.span({ class: 'text-xs' }, [item.priority])`.
- **Contracts:** if the app has contracts that send `Add` or return an item, add `priority` to their payloads,
  inputs and results. These transitions only copy values, so they need no new contract.
- **server:** store `priority` where the items live (the scaffold's `demoItems` stand-in, or the database) and return it.

<!-- more -->

With a kit: `ui.use(Button, { variant: { tone: 'quiet' } }, ['Clear done'])`.

## An action button that works on many items (e.g. "Clear done")
- **model:**
  - `export const ClearDone = event({ payload: z.object({}) })`;
  - `export const clearDone = mutation({ input: z.object({}), output: z.object({ removed: z.number() }), invalidates: () => [itemsTag()], runs: 'server', access: 'anyone' })`;
  - in `idle`: `on(ClearDone, { target: 'clearing', assign: () => { ctx.error = null } })`;
  - a state
    `clearing: { invoke: invoke(clearDone, { input: {}, done: 'idle', failed: { Unexpected: { target: 'idle', assign: () => { ctx.error = 'unexpected' } } } }) }`
    (busy states drop events they do not handle, so no `ignore`).
- **views:** the control
  `ui.form({ on: { submit: ui.send(ClearDone, {}) } }, [ui.button({ type: 'submit', class: 'text-sm underline' }, ['Clear done'])])`.
- The new transitions only copy values, so they need no contract (the feature lists `model`, so both are registered).
- **server:**
  `implement(clearDone, () => { const before = demoItems.length; demoItems.splice(0, demoItems.length, ...demoItems.filter((i) => !i.done)); return { removed: before - demoItems.length } })` (with a database: one delete of the done rows).
- **Try it:** `hozu browse / --do 'click Clear done'`.

## A field shown on the detail page
In the detail view's `ready`: `ui.p({}, ['Priority: ', item.priority])`. The detail query already returns the whole
item.

## A detail page, when the feature has none
Run a fresh scaffold into a scratch app with `--with detail`, and copy the parts it prints:
- the route with params;
- the `get` query and its resolver;
- the detail view;
- the link in the list;
- `ui.page(...)` with `head` and `entries`.

## Dark mode
- Following the system needs no code: Tailwind's `dark:` classes (`bg-white dark:bg-slate-900`).
- A switch the visitor chooses: a client component (`hozu docs components`) puts `dark` on `<html>` and keeps the
  choice in `localStorage`; `app.css` adds `@custom-variant dark (&:where(.dark, .dark *));`.

## A shell shared by many pages (a back office)
Pages are config, so a helper is the layout:
```ts
const staffHead = { query: me, render: (m) => ({ title: `${m.name} · Admin` }), failed: { Forbidden: signIn } }
const staff = (route, View) => ui.page(route, { views: [Sidebar, View], head: staffHead })
export default project({ /* … */ pages: [staff(orders, OrderList), staff(orderDetail, OrderPage), …] })
```
The sidebar's links mark the page shown with `aria-current` by themselves (`aria-[current]:font-bold`).

## Screens with different state
One machine per feature: an order list (filters, selection) and an order page (shipping, refund) are two features,
`orders` and `order`, sharing declarations through `exports`. Each machine stays small and its contracts few.

## A multi-step checkout that also works without JavaScript
Each step is a state; the server runs the machine per request, so without JS a step's form posts every earlier field
again as hidden inputs (`ui.input({ type: 'hidden', name: 'line1', value: ctx.line1 })`), and the last step's
mutation receives them all. Prefill from the member with `seed: ({ query }) => ({ email: query(me, {}).email })`.

## A notice after saving
A `notice` context field set in `done` and cleared by `after: [{ ms: 4000, target: 'idle' }]` on a `saved` state;
the view shows `ctx.notice !== null && ui.p({ role: 'status' }, [ctx.notice])`. There is no global toast store.
