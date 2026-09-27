# Changing a Hozu app

Keep the loop short: map once, edit everything, check once, verify once.

## 1. Read
- The change request.
- `pnpm exec hozu map`: every route, query, mutation, event, state, view and contract, each with its `file:line`.
  Open only the lines the change touches. Below, *model* is where the app keeps schemas, events, effects and
  the machine (`model.ts`), and *views* where it keeps views, contracts and `feature()`.
- The API is in `SKILL.md`. Use a recipe below when one fits; open `patterns.md` / `reference.md` only for
  something else.

## 2. Recipes
Names follow `hozu add feature items`: `Item`, `NewItem`, `Add`, `addItem`, `itemsMachine`, `ItemsBoard`.

### A field chosen in the add form (an enum)
- **model:**
  - `export const Priority = z.enum(['low', 'normal', 'high'])`;
  - add `priority: Priority` to `Item`, `NewItem` and the `Add` payload;
  - context: `priority: Priority`, with `priority: 'normal'` in `initialContext`;
  - `fields` gets `priority: z.string().nullable()`, with `priority: null` in `initialContext` and in the `Add`
    assign that resets it;
  - the `Add` assign also gets `op.set(ctx.priority, e.priority)`, and the add `invoke` input becomes
    `{ title: ctx.draft, priority: ctx.priority }`.
- **views:**
  - the form's submit sends `{ title: ui.dom.form('title'), priority: ui.dom.form('priority') }`;
  - inside the form add
    `ui.select({ name: 'priority', 'aria-label': 'Priority', class: 'rounded border px-2' }, ['low', 'normal', 'high'].map((p) => ui.option({ value: p, selected: p === 'normal' }, [p])))`;
  - in the item: `ui.span({ class: 'text-xs' }, [item.priority])`.
- **Contracts:** if the app has contracts that send `Add` or return an item, add `priority` to their payloads,
  inputs and results. These transitions only copy values, so they need no new contract.
- **server:** store `priority` (seed items included) and return it.

### An action button that works on many items (e.g. "Clear done")
- **model:**
  - `export const ClearDone = event({ payload: z.object({}) })`;
  - `export const clearDone = mutation({ input: z.object({}), output: z.object({ removed: z.number() }), invalidates: () => [itemsTag()] })`;
  - in `idle`: `on(ClearDone, { target: 'clearing', assign: () => [op.set(ctx.error, null)] })`;
  - a state
    `clearing: { invoke: invoke(clearDone, { input: {}, done: 'idle', failed: { Unexpected: { target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] } } }) }`
    (busy states drop events they do not handle, so no `ignore`).
- **views:** the control
  `ui.form({ on: { submit: ui.send(ClearDone, {}) } }, [ui.button({ type: 'submit', class: 'text-sm underline' }, ['Clear done'])])`.
- Add `ClearDone` and `clearDone` to `declarations`. The new transitions only copy values, so they need no contract.
- **server:**
  `implement(clearDone, () => { const before = items.length; items.splice(0, items.length, ...items.filter((i) => !i.done)); return { removed: before - items.length } })`.
- **Try it:** `hozu post / --button 'Clear done' --next /`.

### A field shown on the detail page
In the detail view's `ready`: `ui.p({}, ['Priority: ', item.priority])`. The detail query already returns the whole
item.

### A detail page, when the feature has none
Run a fresh scaffold into a scratch app with `--with detail`, and copy the parts it prints:
- the route with params;
- the `get` query and its resolver;
- the detail view;
- the link in the list;
- `ui.page(...)` with `head` and `entries`.

### Other changes
| Change | Touch |
|---|---|
| New UI-only state (a tab) | model: the context field and its initial value, an event, an `on` that `op.set`s it → views: the control, the event in `declarations` (no contract: it only copies a value). |
| Filter / sort / page in the URL | the route's `search` schema (with a default) → links with `ui.link(route, params, { key: value })` → read `search.key` in the view. No machine change. |
| New page | `routes.ts` → a view with `route`, in `declarations` → `ui.page(...)` in `hozu.config.ts` (`head`, and `entries` when the route has params). |

Whenever the machine changes:
- A transition that decides something (a guard, `navigate`, or a `fn` in its values) needs a contract; HZ016
  prints each missing one ready to paste. Transitions that only copy values are reviewed through the lock.
- States with `invoke` drop unhandled events by themselves. Other states must handle or `ignore` every event their
  visible controls send; HZ005 prints the missing entries.

## 3. Check (once, after all edits)
```
pnpm exec hozu check
```
Fix what it reports. When the behaviour change is intended, run `pnpm exec hozu check --update-lock`: HZ018 shows
each changed transition as `was: … now: …`, and accepting it updates the lock.

## 4. Verify (once, no server needed)
- **Pages:** `pnpm exec hozu get / /items/i1` prints the status, title, alerts and visible text.
- **Attributes and forms:** `--select button` (or `'[role=alert]'`, `a[href]`, `#id`) prints elements with their
  attributes, e.g. `aria-pressed`; `--forms` lists each form's fields and buttons. Never start a server for this.
- **Forms:** `pnpm exec hozu post / --field title=A --field priority=high --next /items` fills the form like a
  browser (other fields keep their defaults). It follows the redirect, then runs the next steps in the same
  process.
- **Chaining:** chain what must share data, e.g. `--next 'POST / title=a'` (fields as `a=1&b=2`) or
  `--next /items/i3`.
- **A form with only a button:** `--button 'Clear done'`, or `--next 'POST / @Clear done'`. With one form per item,
  `--field id=t2` picks the item's form.
