# Views

```ts
export const Board = ui.view({
  machine: m,        // optional: without it, no ctx / when / events, and 0 JS
  route: home,       // optional: render gets { params, search } typed by the route
  render: ({ ctx, when, params, search, locale }) => ui.main({ class: 'mx-auto max-w-xl' }, [ /* children */ ]),
})
```
- **Elements:** `ui.<tag>(attrs, children)` for every HTML and SVG element; void tags (`input`, `img`) take only attrs.
  Children are nodes, strings, numbers, data values, and `null` / `false` (render nothing).
- **Attributes:** HTML names in lower case (`for`, `minlength`, `aria-pressed`, `data-x`), typed per tag. Values are
  literals or data: `'aria-pressed': ctx.show === 'all'`, `title: ctx.error ?? 'OK'`.
- **Classes:** `class` is a static string of Tailwind classes that must exist (HZ026). Conditional classes:
  `toggle: { 'bg-indigo-600 text-white': ctx.tab === t }`. CSS variables: `vars: { '--hue': item.hue }`. No `style`.
- **Conditions:** `ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])`, `item.done ? 'done' : 'open'`,
  `list.length === 0 ? ui.p({}, ['Empty']) : ui.ul({}, [...])`. With an enter/leave animation:
  `ui.if(cond, [then], [else], 'fade')`.
- **By machine state:** `when(['adding', 'saving'], [ui.p({}, ['Saving…'])])`.
- **Lists:** `ui.each(items, 'id', (item) => ui.li({}, [item.title]))`; `ui.each(tags, null, (t) => …)` for primitives.
  Never `.map` over data (only over constants: `['a', 'b'].map((k) => ui.option({ value: k }, [k]))`).
- **Text:** template strings work: `` `${n} items` ``.
- **Events:** `on: { click: ui.send(Event, payload) }`, any DOM event name plus `visible` (entered the viewport).
  Payload fields: literals, data, `ui.dom.value`, `ui.dom.form('name')`, `ui.dom.checked`, `ui.dom.valueAsNumber`,
  `ui.dom.key`. `ui.dom.value` / `ui.dom.form` fill an enum field only from a `<select>` or radios whose literal
  option values are all members (HZ033).
- **Links:** `ui.a({ href: ui.link(itemPage, { id: item.id }) }, [...])`; never a string path (HZ032). The third
  argument exists only when the route declares `search`: `ui.link(home, null, { show: 'done' })`.
- **Data:** `ui.query(listItems, input, { ready: (items) => …, pending: ui.p({}, ['Loading…']), failed: { NotFound:
  () => …, Unexpected: () => … } })`; `pending` is optional, `failed` lists every declared error plus `Unexpected`.
  Server-fetched data is sent with the page and never fetched again; after a mutation, queries whose tags it
  invalidates refresh in place.
- **Also:** `ui.html(post.html)` (trusted HTML from query data only, HZ030), `ui.asset(new URL('./x.png',
  import.meta.url))`, `ui.window({ on })` / `ui.document({ on })`, `ui.embed(OtherView)`.
