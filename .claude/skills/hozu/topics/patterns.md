# Common UI patterns

Each pattern is complete here; there is no need to open other files.

- **Busy state:** render every control once; the state with `invoke` drops repeated submits. Progress:
  `when(['adding'], [ui.p({ 'aria-busy': 'true' }, ['Saving…'])])`. Do not duplicate controls under `when`.
- **Optimistic item:** `when(['adding'], [ui.li({ class: 'opacity-50' }, [ctx.draft])])`; leaving the state removes it
  and the refreshed query shows the real item.
- **Filter and empty state** (in context): one helper, two `fn`s over the list:
```ts
const shows = (i: Item, show: Show) => show === 'all' || (show === 'done') === i.done   // sent with the fns
export const visible = fn({ input: z.object({ items: z.array(Item), show: Show }), output: z.array(Item),
  impl: ({ items, show }) => items.filter((i) => shows(i, show)) })
export const isEmpty = fn({ input: z.object({ items: z.array(Item), show: Show }), output: z.boolean(),
  impl: ({ items, show }) => !items.some((i) => shows(i, show)) })
// view
isEmpty({ items, show: ctx.show })
  ? ui.p({ class: 'text-slate-500' }, ['No items'])
  : ui.ul({}, [ui.each(visible({ items, show: ctx.show }), 'id', (i) => ui.li({}, [i.title]))])
```
- **Search as you type:** context `search: z.string()`; `ui.input({ type: 'search', 'aria-label': 'Search', value:
  ctx.search, on: { input: ui.send(Search, { text: ui.dom.value }) } })`; `on(Search, { target: 'idle', assign: (e) =>
  { ctx.search = e.text } })`; filter with a `fn({ input: z.object({ items, text: z.string() }), … })`.
- **Toggle buttons:** for each option of a constant list,
  `ui.button({ type: 'button', 'aria-pressed': ctx.show === s.value, on: { click: ui.send(SetShow, { show: s.value }) } }, [s.label])`.
- **Filter in the URL** (shareable, no JS): `search` on the route, options as
  `ui.a({ href: ui.link(home, null, { show: s.value }), 'aria-current': search.show === s.value }, [s.label])`.
- **In the URL and as you type** (`/?q=park` works without JS, typing filters live): seed the machine from the URL
  and read only the context. A GET form with `name="q"` submits it without JS.
```ts
export const Board = ui.view({ machine: m, route: home, seed: ({ search }) => ({ q: search.q, district: search.district }),
  render: ({ ctx }) => ui.form({ method: 'get' }, [
    ui.input({ type: 'search', name: 'q', 'aria-label': 'Search', value: ctx.q, on: { input: ui.send(Search, { q: ui.dom.value }) } }),
    /* … */ ui.each(visible({ items, q: ctx.q, district: ctx.district }), 'id', (s) => …) ]) })
```
- **A mode with shared controls** (a tour, an edit mode): put what every mode handles the same way in
  `machine({ on: [on(Search, { assign: (e) => { ctx.q = e.q } })] })` (no `target`: stays in its state); each state
  lists only what differs.
- **Per-item action** (toggle, pin, delete): each item gets its own small form, so it works without JS:
```ts
ui.form({ on: { submit: ui.send(Toggle, { id: ui.dom.form('id') }) } }, [
  ui.input({ type: 'hidden', name: 'id', value: item.id }),
  ui.button({ type: 'submit' }, [item.done ? 'Reopen' : 'Done']),
])
// machine: on(Toggle, { target: 'toggling', assign: (e) => { ctx.target = e.id } })
// toggling: { invoke: invoke(toggleItem, { input: { id: ctx.target }, done: 'idle', failed: { Unexpected: 'idle' } }) }
```
  Try it without a server: `hozu post / --field title=x --next 'POST / id=i1&@Done' --next /`.
- **Sorted or pinned first:** sort in the resolver (the list query returns items in display order), or in a `fn`.
- **Refresh after a mutation:** tag the query, list the tag in the mutation's `invalidates`.
- **Go to what was just created:** `done: { target: 'idle', navigate: (r) => ui.link(itemPage, { id: r.id }) }`.
- **Detail page with a 404:** `hozu docs pages`.
- **UI kept across links** (a cart, a player): list the same machine view on each page, in the same order.
- **Load more:** context `{ cursors: [null], last: null }`;
  `ui.each(ctx.cursors, null, (cursor) => ui.query(listPage, { cursor }, { ready: (page) => … }))`; on the last page
  (`cursor === ctx.last && page.next !== null`) a sentinel `on: { visible: ui.send(More, { cursor: page.next }) }`;
  `More` pushes the cursor, guarded by `e.cursor !== null && e.cursor !== ctx.last`.
