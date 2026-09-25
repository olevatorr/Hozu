# Tenon patterns

Each pattern is used in `examples/bookmarks`.

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

- **Filter in the URL** (shareable, works without JS): declare `search` on the route, render the options as
  `ui.link(home, null, { show: s.value })` links with `'aria-current': op.eq(search.show, s.value)`, and filter with
  `fn`s over `search.show`. Only use machine context for filters that should not survive a reload.
- **Go to what was just created**: `done: [{ target: 'idle', navigate: (r) => ui.link(itemPage, { id: r.id }, null) }]`.
- **No-JS form**: every value the submit needs is a named field read with `ui.dom.form('name')`; the server runs the
  machine for a native post. Per-item actions without JS: wrap the button in its own small form.
