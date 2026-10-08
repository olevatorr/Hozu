# Views

```ts
export const Board = ui.view({
  machine: m,        // optional: without it, no ctx / is / events, and 0 JS
  route: home,       // optional: render gets { params, search } typed by the route
  seed: ({ search }) => ({ q: search.q }),   // optional, with machine + route: context fields from the URL
  render: ({ ctx, is, current, params, search, locale }) => ui.main({ class: 'mx-auto max-w-xl' }, [ /* children */ ]),
})
```
- **Elements:** `ui.<tag>(attrs, children)` for every HTML and SVG element; void tags (`input`, `img`) take only attrs.
  Children are nodes, strings, numbers, data values, and `null` / `false` (render nothing).
- **Classes:** `class` is a static string of Tailwind classes that must exist (HZ026); conditional classes:
  `toggle: { 'bg-indigo-600 text-white': ctx.tab === t }`. No `style`.
- **Conditions:** `ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])`, `item.done ? 'done' : 'open'`.
  By machine state: `!is(['idle']) && ui.p({}, ['Saving…'])`,
  `disabled: is(['saving'])` (disable a control while busy, not hide it: it stays put).
- **Dialogs, popovers, menus:** native (bound to the machine: --more): `ui.button({ commandfor: 'd', command:
  'show-modal' })` + `ui.dialog({ id: 'd', closedby: 'any' }, [...])`, `popover` / `popovertarget`, `ui.details`.
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
  across a page change. `hozu browse` reports a flash or a layout shift: fix those. `c ? a : b` whose branches are
  one element of the same tag and shape (`ctx.paused ? resumeButton : pauseButton`) keeps the element: its text,
  classes, attributes and listener follow `c`, and focus stays (not when a differing value computes, such as a `fn`
  or a template string, or links elsewhere).
- **Attributes:** HTML names in lower case (`for`, `minlength`, `aria-pressed`, `data-x`), typed per tag. Values are
  literals or data: `'aria-pressed': ctx.show === 'all'`, `title: ctx.error ?? 'OK'`.
- **Sizes and colours from data:** `vars` with an arbitrary-value class: `class: 'w-[calc(var(--pct)*1%)]'`,
  `vars: { '--pct': q.share }`; `class: 'bg-(--c)'`, `vars: { '--c': tag.color }`.
- **Computed attributes:** a `fn` returns any value, an SVG path too: `ui.path({ d: sparkline({ points: q.history }) })`
  (runs on the server, and in the browser inside an island).
- **More conditions:** `list.length === 0 ? ui.p({}, ['Empty']) : ui.ul({}, [...])`; a `?:` / `&&` branch may be a list:
  `open ? [a, b] : null`. A query branch or an each item returns one node: wrap several in an element (HZ014).
  With an enter/leave animation (only then): `ui.if(cond, [then], [else], 'fade')`, by machine state
  `when(['saving'], [children], 'fade')`, and list rows `ui.each(items, 'id', row, 'fade')` (the motion name is
  required; without a motion, `is([...]) && …`).
- **More lists:** `ui.each(tags, null, (t) => …)` for primitives. `.map` only over constants:
  `['a', 'b'].map((k) => ui.option({ value: k }, [k]))`.
- **Text:** template strings work: `` `${n} items` ``.
- **Reuse:** `export const row = part((item: Item) => ui.li({}, [item.done ? 'Done' : item.title]))`, called as
  `row(item)`; it is inlined, so the IR equals the inline form. A plain function that receives data is HZ059.
- **Shared UI:** use the kit component, not a styled `ui.button` per page (`example/` uses a kit).
- **More events:** any DOM event name plus `visible` (entered the viewport). Payload fields also:
  `ui.dom.formAll('name')`, `ui.dom.checked`, `ui.dom.valueAsNumber`, `ui.dom.key`. Keyboard shortcuts
  belong to the control they press: `ui.input({ name: 'q', keys: ['/'] })` focuses the field, `ui.button({ type:
  'submit', keys: ['Mod+s'] }, ['Save'])` clicks it (so the form submits; no machine needed). `Mod` is ⌘ on Apple,
  Ctrl elsewhere; also `Ctrl`, `Meta`, `Alt`, `Shift`. A printable key without a modifier waits while the person types
  in another field (`Escape` does not); inside an open modal only its controls count. The page loads a small module
  for it and writes `aria-keyshortcuts`; two controls always shown together with one key is HZ014. `ui.dom.value` / `ui.dom.form`
  fill an enum field only from a `<select>`, radios or submit buttons whose literal values are all members (HZ033).
- **Search in links:** the third argument of `ui.link` is optional and exists only when the route declares `search`:
  omitted means every default, and a search lists only the fields that differ: `ui.link(home, null, { show: 'done' })`.
- **More data:** `pending: ui.p({}, ['Loading…'])` is optional; a branch may return `null` to render nothing.
  Server-fetched data is sent with the page and never fetched again; after a mutation, queries whose tags it
  invalidates refresh in place. When a query's input changes, the rows stay (`aria-busy` on the parent) and update
  by key; `pending` shows only before the first answer.
- **From Vue or React:** `computed` → a `fn`; `ref` + `@click` → a context field + `ui.set`; `v-if` → `?:` / `&&`
  (with `is([...])` for a machine state); `v-for` + `:key` → `ui.each(list, 'id', …)`; `setInterval` → `freshness: { poll: s }`
  for data that changes on its own (`hozu docs data`), `after` with `refresh` for a refresh the visitor pauses
  (`hozu docs machine`); `watch` → a transition's `assign`; DOM libraries (charts, maps) → a client component
  (`hozu docs components`; `examples/showcase` has a Chart.js one).
- **Also:** `ui.html(post.html)` (trusted HTML from query data only, HZ030), `ui.asset(new URL('./x.png',
  import.meta.url))`, `ui.window({ on })` / `ui.document({ on })`, `ui.embed(OtherView)`.

## Menus, dialogs, counting
- A link to the address shown gets `aria-current="page"`. Which links mark a section is yours to say: the render's
  `current(route)` is true on that route's pages, so a menu writes
  `ui.a({ href: ui.link(orders, null), 'aria-current': current(orders) || current(orderDetail) }, ['Orders'])` and
  styles `aria-[current]:font-bold`: `true` is written `"page"` on the address itself, `false` writes nothing.
  `current(shop, { category: 'apparel' })` also compares those params (search is ignored). A menu is a constant
  list mapped to links, one line per section:
  `...[[orders, 'Orders'], [customers, 'Customers']].map(([r, label]) => ui.a({ href: ui.link(r, null),
  'aria-current': current(r) }, [label]))`; `current(a) || current(b)` works there too.
- `ui.dialog({ open: is(['editing']), on: { close: ui.send(Cancel, {}) } }, [...])` opens as a modal and closes with
  the machine; Escape sends `close`. It needs JavaScript: a dialog that must open without it uses the native
  `commandfor` button (the short form) and closes when the data that shows it changes.
- `ui.format.plural(n, { one: '# item', other: '# items' })` picks the case for the page's language (`=0` works).
- `null` and `false` render nothing, also inside a constant list:
  `ui.ul({}, [...kinds.map((k) => (k === 'draft' ? null : ui.li({}, [k])))])`.
