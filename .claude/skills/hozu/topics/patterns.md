# Common UI patterns

Patterns marked *(example)* are in `example/features/bookmarks/` next to the skill.
- **Busy state** *(example)*: render every control once; the state with `invoke` drops repeated submits. Show
  progress with `when(['adding'], [...])`; do not duplicate controls under `when`.
- **Optimistic item** *(example)*: `when(['adding'], [ui.p({ class: 'opacity-50' }, [`Adding ${ctx.draft}…`])])`;
  leaving the state removes it and the refreshed query shows the real item.
- **Filter and empty state** *(example)*: `fn`s over the list:
  `isEmpty({ items, show }) ? ui.p({}, ['Nothing here']) : ui.ul({}, [ui.each(visible({ items, show }), 'id', …)])`.
- **Filter in the URL** *(example)* (shareable, no JS): declare `search` on the route, render options as
  `ui.a({ href: ui.link(home, null, { show: s.value }), 'aria-current': search.show === s.value }, [s.label])`.
  Use context only for filters that should not survive a reload.
- **Toggle buttons:** `'aria-pressed': ctx.show === s.value`, `on: { click: ui.send(SetShow, { show: s.value }) }`.
- **Per-item action** *(example)*: `ui.send(Toggle, { id: item.id })` → a state that sets `ctx.target = e.id` and
  invokes the mutation with `{ id: ctx.target }`; label by data: `[item.done ? 'Reopen' : 'Done']`.
- **Refresh after a mutation** *(example)*: tag the query, list the tag in the mutation's `invalidates`.
- **Go to what was just created** *(example)*: `done: { target: 'idle', navigate: (r) => ui.link(itemPage, { id: r.id }) }`.
- **Detail page with a 404** *(example)*: see `hozu docs pages`.
- **UI kept across links** (a cart, a player): list the same machine view on each page, in the same order.
- **Load more:** context `{ cursors: [null], last: null }`;
  `ui.each(ctx.cursors, null, (cursor) => ui.query(listPage, { cursor }, { ready: (page) => … }))`; on the last page
  (`cursor === ctx.last && page.next !== null`) a button / sentinel `on: { visible: ui.send(More, { cursor: page.next }) }`;
  `More` pushes the cursor, guarded by `e.cursor !== null && e.cursor !== ctx.last`. Needs JS; without JS, page with
  `search` links.
