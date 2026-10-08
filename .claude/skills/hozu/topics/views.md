# Views

```ts
export const Board = ui.view({
  machine: m,        // optional: without it, no ctx / when / events, and 0 JS
  route: home,       // optional: render gets { params, search } typed by the route
  seed: ({ search }) => ({ q: search.q }),   // optional, with machine + route: context fields from the URL
  render: ({ ctx, when, is, params, search, locale }) => ui.main({ class: 'mx-auto max-w-xl' }, [ /* children */ ]),
})
```
- **Elements:** `ui.<tag>(attrs, children)` for every HTML and SVG element; void tags (`input`, `img`) take only attrs.
  Children are nodes, strings, numbers, data values, and `null` / `false` (render nothing).
- **Classes:** `class` is a static string of Tailwind classes that must exist (HZ026); conditional classes:
  `toggle: { 'bg-indigo-600 text-white': ctx.tab === t }`. No `style`.
- **Conditions:** `ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])`, `item.done ? 'done' : 'open'`.
  By machine state: `is(['paused']) ? resume : pause`, `!is(['idle']) && ui.p({}, ['Saving…'])`,
  `disabled: is(['saving'])` (keep a control and disable it rather than hide it while busy: no flash).
- **Dialogs, popovers, menus:** native, no machine state: `ui.button({ commandfor: 'd', command: 'show-modal' })` +
  `ui.dialog({ id: 'd', closedby: 'any' }, [...])`, `popover` / `popovertarget`, `ui.details`.
- **Lists:** `ui.each(items, 'id', (item) => ui.li({}, [item.title]))`. Never `.map` over data.
- **Numbers and dates:** `ui.format.number(q.price, { style: 'currency', currency: 'USD' })`, `ui.format.date(x,
  { dateStyle: 'medium' })`, `ui.format.relative(n, 'day')`, `ui.format.list(xs)` (Intl, the page's locale).
- **Events:** `on: { click: ui.send(Event, payload) }`; payload fields are literals, data, `ui.dom.value`,
  `ui.dom.form('name')` (submit; `hozu docs forms`). A control that only sets a context field:
  `on: { click: ui.set(ctx.open, !ctx.open) }`, `on: { input: ui.set(ctx.q, ui.dom.value) }` (no event to declare).
- **Links:** `ui.a({ href: ui.link(itemPage, { id: item.id }) }, [...])`; never a string path (HZ032). Menus,
  dialogs, plurals: --more.
- **Data:** `ui.query(listItems, input, { ready: (items) => …, failed: { NotFound: () => …, Unexpected: () => … } })`;
  `failed` lists every declared error plus `Unexpected`.
- **Shared UI** (buttons, inputs, fields): `ui.use(Button, { variant, props, on }, ['Save'])` of a kit component
  (`hozu docs components`).

<!-- more -->

- **Motion:** what an update adds fades in by itself (not with reduced motion); a view two pages show stays still
  across a page change. `hozu browse` reports a flash or a layout shift: fix those.
- **Attributes:** HTML names in lower case (`for`, `minlength`, `aria-pressed`, `data-x`), typed per tag. Values are
  literals or data: `'aria-pressed': ctx.show === 'all'`, `title: ctx.error ?? 'OK'`.
- **Sizes and colours from data:** `vars` with an arbitrary-value class: `class: 'w-[calc(var(--pct)*1%)]'`,
  `vars: { '--pct': q.share }`; `class: 'bg-(--c)'`, `vars: { '--c': tag.color }`.
- **Computed attributes:** a `fn` returns any value, an SVG path too: `ui.path({ d: sparkline({ points: q.history }) })`
  (runs on the server, and in the browser inside an island).
- **More conditions:** `list.length === 0 ? ui.p({}, ['Empty']) : ui.ul({}, [...])`; a `?:` / `&&` branch may be a list:
  `open ? [a, b] : null`. A query branch or an each item returns one node: wrap several in an element (HZ014).
  With an enter/leave animation: `ui.if(cond, [then], [else], 'fade')` (the motion name is required).
- **More lists:** `ui.each(tags, null, (t) => …)` for primitives. `.map` only over constants:
  `['a', 'b'].map((k) => ui.option({ value: k }, [k]))`.
- **Text:** template strings work: `` `${n} items` ``.
- **Reuse:** `export const row = part((item: Item) => ui.li({}, [item.done ? 'Done' : item.title]))`, called as
  `row(item)`; it is inlined, so the IR equals the inline form. A plain function that receives data is HZ059.
- **Shared UI:** use the kit component, not a styled `ui.button` per page (`example/` uses a kit).
- **More events:** any DOM event name plus `visible` (entered the viewport). Payload fields also:
  `ui.dom.formAll('name')`, `ui.dom.checked`, `ui.dom.valueAsNumber`, `ui.dom.key`. `ui.dom.value` / `ui.dom.form`
  fill an enum field only from a `<select>`, radios or submit buttons whose literal values are all members (HZ033).
- **Search in links:** the third argument of `ui.link` is optional and exists only when the route declares `search`:
  omitted means every default, and a search lists only the fields that differ: `ui.link(home, null, { show: 'done' })`.
- **More data:** `pending: ui.p({}, ['Loading…'])` is optional; a branch may return `null` to render nothing.
  Server-fetched data is sent with the page and never fetched again; after a mutation, queries whose tags it
  invalidates refresh in place.
- **From Vue or React:** `computed` → a `fn`; `ref` + `@click` → a context field + `ui.set`; `v-if` → `?:` / `&&`
  (with `is([...])` for a machine state); `v-for` + `:key` → `ui.each(list, 'id', …)`; `setInterval` → `after` with
  `refresh` (`hozu docs machine`); `watch` → a transition's `assign`; DOM libraries (charts, maps) → a client component
  (`hozu docs components`; `examples/showcase` has a Chart.js one).
- **Also:** `ui.html(post.html)` (trusted HTML from query data only, HZ030), `ui.asset(new URL('./x.png',
  import.meta.url))`, `ui.window({ on })` / `ui.document({ on })`, `ui.embed(OtherView)`.

## Menus, dialogs, counting
- When a query's input changes, the rows stay (`aria-busy` on the parent) and update by key; `pending` shows only
  before the first answer.
- A link to the page shown gets `aria-current="page"`, a link to a section above it (`/orders` on `/orders/7`)
  `"true"`; the same path with another search (a next page) gets nothing. An `aria-current` you set wins.
- `ui.dialog({ open: is(['editing']), on: { close: ui.send(Cancel, {}) } }, [...])` opens as a modal and closes with
  the machine; Escape sends `close`. It needs JavaScript: a dialog that must open without it uses the native
  `commandfor` button (the short form) and closes when the data that shows it changes.
- `ui.format.plural(n, { one: '# item', other: '# items' })` picks the case for the page's language (`=0` works).
- `null` and `false` render nothing, also inside a constant list:
  `ui.ul({}, [...kinds.map((k) => (k === 'draft' ? null : ui.li({}, [k])))])`.
