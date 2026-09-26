# Tenon patterns

Patterns marked *(example)* are used in `example/`, next to this file.

- **Form with a server-side error** *(example)*:
  - `ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [label, input, button])`.
  - The machine goes to `adding`, which invokes the mutation. `failed.Duplicate` sets `ctx.error`.
  - Show the error with `ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert' }, [ctx.error])], [])`.
  - To clear the input after success, bind `value: ctx.draft` and reset `draft` in `done`.
- **Busy states (a mutation in flight)** *(example)*: render every control **once**. In each busy state, `ignore` the events
  those controls send. Do not duplicate controls under `when`. Handling them there would re-enter the busy state
  instead, and TN005 would reject leaving them unhandled.
- **Filtering and empty state** *(example)*: `ui.each(visible({ items, show: ctx.show }), 'id', …)` and
  `ui.if(isEmpty({ items, show: ctx.show }), [ui.p({}, ['No items'])], [ui.ul(...)])`, both using `fn`s.
- **Toggle buttons** (`aria-pressed`): `'aria-pressed': op.eq(ctx.show, s.value)` plus
  `on: { click: ui.send(SetShow, { show: s.value }) }` for each option of a constant list.
- **Per-item action** *(example)*:
  - `ui.send(ToggleRead, { id: item.id })` → a `toggling` state that stores `ctx.target` and invokes the mutation
    with `{ id: ctx.target }`.
  - Label text by data: `ui.if(op.eq(item.read, true), ['Mark unread'], ['Mark read'])`.
- **Select bound to an enum**:
  `ui.select({ 'aria-label': 'Kind', on: { change: ui.send(PickKind, { kind: ui.dom.value }) } }, kinds.map((k) => ui.option({ value: k, selected: op.eq(ctx.kind, k) }, [k])))`,
  where the event payload is `{ kind: Kind }`, the zod enum.
- **Detail page with a 404** *(example)*: a view with `route: itemPage` and no machine,
  `ui.query(getItem, { id: params.id }, { ready, pending: null, failed: { NotFound: () => ..., Unexpected: () => ... } })`,
  plus `head.query: getItem`.
- **Refresh after a mutation** *(example)*: tag the query, and list the tag in the mutation's `invalidates`. A mutation can
  read only its input for tag params; use a list-wide tag when it affects many items.

- **Filter in the URL** *(example)* (shareable, works without JS): declare `search` on the route, render the options as
  `ui.link(home, null, { show: s.value })` links with `'aria-current': op.eq(search.show, s.value)`, and filter with
  `fn`s over `search.show`. Only use machine context for filters that should not survive a reload.
- **Go to what was just created** *(example)*: `done: [{ target: 'idle', navigate: (r) => ui.link(itemPage, { id: r.id }) }]`.
- **No-JS form** *(example)*: every value the submit needs is a named field read with `ui.dom.form('name')`; the server runs the
  machine for a native post. Per-item actions without JS: wrap the button in its own small form.
- **UI that survives following a link** (a cart, a player, a chat box): list the same
  view with a machine on every page that should keep it, in the same order, e.g. `views: [ProductGrid, CartPanel]`
  and `views: [ProductDetail, CartPanel]`. Links between those pages then swap only the other views; the kept view's
  DOM and machine state stay. Nothing to declare: a view is kept only if it never reads `params`/`search` (neither
  in its tree nor in its machine). `tenon plan <route>` lists what is kept per target route. Style the loading
  state with `html[data-tenon-navigating]`.
- **Two languages**: `site.locales`, one `ui.messages` per feature, a language switcher of
  `ui.a({ href: ui.alternate('en'), hreflang: 'en', lang: 'en' }, ['English'])` links, and `ui.format.date` for dates.
- **Load more / infinite scroll**: context `{ cursors: [null], last: null }`;
  `ui.each(ctx.cursors, null, (cursor) => ui.query(listPage, { cursor }, { ready: (page) => ... }))`; in the last page
  (`op.and(op.eq(cursor, ctx.last), op.neq(page.next, null))`) render a button with `on: { click: ui.send(More,
  { cursor: page.next }) }` and a sentinel `ui.div({ class: 'h-px', on: { visible: ui.send(More, …) } }, [])`.
  `More` appends the cursor and sets `last`, guarded by `op.and(op.neq(ctx.last, e.cursor), op.neq(e.cursor, null))`
  so a page loads once. It needs JS; a list that must work without JS pages through `search` links.
- **Optimistic item** *(example)*: while the mutation runs, render the pending value from context
  in the busy state: `when(['adding'], [ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])])`.
  Leaving the state (done or failed) removes it; the refreshed query shows the real item.
- **Field errors** *(example)*: context `fields: z.object({ title: z.string().nullable(), kind:
  z.string().nullable() })`, reset it on submit, `failed.Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields,
  e.fields)] }]`, and render `ui.p({ id: 'title-error' }, [ctx.fields.title])` with `'aria-invalid': op.neq(ctx.fields.title,
  null)` on the input. It also works without JS.
