# Common UI patterns

The controls are plain elements; in an app with a kit, use its components (`ui.use(Button, …)`,
`hozu docs components`).

- **Busy state:** render every control once and disable it: `disabled: is(['adding'])` (`invoke` drops repeats).
  Progress: `is(['adding']) && ui.p({ 'aria-busy': 'true' }, ['Saving…'])`.
- **Optimistic item:** `is(['adding']) && ui.li({ class: 'opacity-50' }, [ctx.draft])`; leaving the state removes it
  and the refreshed query shows the real item.
- **Refresh after a mutation:** tag the query, list the tag in the mutation's `invalidates`.
- **Go to what was just created:** `done: { target: 'idle', navigate: (r) => ui.link(itemPage, { id: r.id }) }`.
- **Per-item action** (toggle, pin, delete): each item gets its own small form:
```ts
ui.form({ on: { submit: ui.send(Toggle, { id: ui.dom.form('id') }) } }, [
  ui.input({ type: 'hidden', name: 'id', value: item.id }),
  ui.button({ type: 'submit' }, [item.done ? 'Reopen' : 'Done']),
])
// machine: on(Toggle, { target: 'toggling', assign: (e) => { ctx.target = e.id } })
// toggling: { invoke: invoke(toggleItem, { input: { id: ctx.target }, done: 'idle', failed: { Unexpected: 'idle' } }) }
```
- **Filter in the URL** (shareable, no JS): `search` on the route, options as
  `ui.a({ href: ui.link(home, null, { show: s.value }), 'aria-current': search.show === s.value }, [s.label])`.
- **Filter as you type, empty state:** context `search: z.string()`, `on: { input: ui.set(ctx.search, ui.dom.value)
  }`, filter and test emptiness with a `fn` (see --more).
- **Detail page with a 404:** `hozu docs pages`.

<!-- more -->

Each pattern is complete here; there is no need to open other files.

- **Per-item action, tried without a server:** `hozu browse / --do 'fill Title=x' --do 'press Enter' --do 'click Done in "x"'`.
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
  ctx.search, on: { input: ui.set(ctx.search, ui.dom.value) } })`; filter with a
  `fn({ input: z.object({ items, text: z.string() }), … })`.
- **Toggle buttons:** for each option of a constant list,
  `ui.button({ type: 'button', 'aria-pressed': ctx.show === s.value, on: { click: ui.set(ctx.show, s.value) } }, [s.label])`.
- **In the URL and as you type** (`/?q=park` is a link to share, typing filters live): seed the machine from the URL,
  read only the context, and write the address back with `replace` on the typing transition
  (`replace: () => ui.link(home, null, { q: ctx.q })`). A GET form with `name="q"` sets it without JS.
```ts
export const Board = ui.view({ machine: m, route: home, seed: ({ search }) => ({ q: search.q, district: search.district }),
  render: ({ ctx }) => ui.form({ method: 'get' }, [
    ui.input({ type: 'search', name: 'q', 'aria-label': 'Search', value: ctx.q, on: { input: ui.send(Search, { q: ui.dom.value }) } }),
    /* … */ ui.each(visible({ items, q: ctx.q, district: ctx.district }), 'id', (s) => …) ]) })
```
- **A mode with shared controls** (a tour, an edit mode): a `ui.set` already works in every state without `invoke`;
  put other transitions every mode handles the same way in
  `machine({ on: [on(Search, { assign: (e) => { ctx.q = e.q; ctx.page = 1 } })] })` (no `target`: stays in its
  state); each state lists only what differs.
- **Select many, then act** (bulk delete): checkboxes in the list join one form through a formRef; the invoke
  state drops events, so the checkboxes are disabled while it runs:
```ts
const bulk = ui.formRef()   // module level; context { selected: z.array(z.string()), busy: z.boolean() }
ui.form({ ref: bulk, on: { submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }) } }, [
  ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete selected']),
  ui.button({ type: 'submit', name: 'action', value: 'pin' }, ['Pin selected']),
])
ui.each(items, 'id', (item) => ui.li({}, [ui.input({ type: 'checkbox', form: bulk, name: 'ids', value: item.id,
  'aria-label': `Select ${item.text}`, checked: ctx.selected.includes(item.id), disabled: ctx.busy,
  on: { change: ui.send(Select, { id: item.id, checked: ui.dom.checked }) } }), item.text]))
// on(Select, { target: 'idle', guard: (e) => e.checked === true, assign: (e) => { ctx.selected.push(e.id) } }),
// on(Select, { target: 'idle', assign: (e) => { ctx.selected = ctx.selected.filter((id) => id !== e.id) } }),
// on(Bulk, { target: 'removingMany', guard: (e) => e.action === 'delete', assign: (e) => { ctx.selected = e.ids; ctx.busy = true } }),
// removingMany: invoke(removeNotes, { input: { ids: ctx.selected }, done/failed: reset selected and busy })
```
  The mutation input holds the limit (`z.array(z.string()).min(1, 'Select at least one note')`).
- **Sorted or pinned first:** sort in the resolver (the list query returns items in display order), or in a `fn`.
- **UI kept across links** (a cart, a player): list the same machine view on each page, in the same order.
- **Load more:** context `{ cursors: [null], last: null }`;
  `ui.each(ctx.cursors, null, (cursor) => ui.query(listPage, { cursor }, { ready: (page) => … }))`; on the last page
  (`cursor === ctx.last && page.next !== null`) a sentinel `on: { visible: ui.send(More, { cursor: page.next }) }`;
  `More` pushes the cursor, guarded by `e.cursor !== null && e.cursor !== ctx.last`.
- **What a link keeps:** every internal link loads a document. A machine whose view both pages show (or the same
  address) resumes its calm state, the last state without `invoke`, from `sessionStorage`; a reload or a page
  without that view starts from `initialContext` (or `seed`). Keep what must survive a reload or a shared link in
  the URL: put both filters in `search` and `seed` the context from it, not one in the URL and one in context.
