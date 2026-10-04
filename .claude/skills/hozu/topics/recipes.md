# Recipes for common changes

Names follow `hozu add feature items`: `Item`, `NewItem`, `Add`, `addItem`, `itemsMachine`, `ItemsBoard`. The controls are plain elements; with a
kit, use its components instead. More recipes (an action over many items, a field on the detail page, a detail page): see --more.

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
- **server:** store `priority` (seed items included) and return it.

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
  `implement(clearDone, () => { const before = items.length; items.splice(0, items.length, ...items.filter((i) => !i.done)); return { removed: before - items.length } })`.
- **Try it:** `hozu browse / --do 'click Clear done'` (with and without JS).

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
