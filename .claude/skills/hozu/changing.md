# Changing a Hozu app

Keep the loop short: map once, edit everything, check once, verify once.

## 1. Read
- The change request.
- `pnpm exec hozu map`: every route, query, mutation, event, state, view and contract, each with its `file:line`.
  Open only the lines the change touches. *model* is `model.ts` (schemas, events, effects, `fn`s, the machine),
  *views* is `views.ts` (views, contracts); `feature.ts` lists both modules, so new exports need no registration.
- The API is in `SKILL.md`. `hozu docs recipes` has worked steps for an enum field in the add form, a bulk action
  button, a detail field and a detail page; `hozu docs <topic>` for anything else.

## 2. What to touch
| Change | Touch |
|---|---|
| New UI-only state (a tab) | model: the context field and its initial value, an event, an `on` whose `assign` sets it → views: the control (no contract: it only copies a value). |
| Filter / sort / page in the URL | the route's `search` schema (with a default) → links with `ui.link(route, params, { key: value })` → read `search.key` in the view. If the page also filters as you type, `seed: ({ search }) => ({ key: search.key })` on the view and read `ctx.key` only. |
| A per-item action stored on the server (pin, archive, star) | model: a field on the item, an event, a mutation that `invalidates` the list tag, `on(Event, { target: 'pinning', assign: (e) => { ctx.target = e.id } })` and a state with `invoke` → views: the per-item form from `hozu docs patterns` → server: store it and sort in the list resolver. These transitions only copy values: no contract. |
| A control that works in every mode | `machine({ on: [...] })` instead of repeating it per state. |
| New page | `routes.ts` → a view with `route` in `views.ts` → `ui.page(...)` in `hozu.config.ts` (`head`, and `entries` when the route has params). |

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
  attributes, e.g. `aria-pressed`; `--forms` lists each form's fields, checkbox groups and buttons. Never start a
  server for this.
- **Forms:** `pnpm exec hozu browse / --do 'fill Title=A' --do 'select Priority=high' --do 'submit Add'` runs the
  steps in Chrome with and without JS and prints what each step changed; `click Done in "A"` picks the item's form.
- **Other users, reloads, sign-out:** one `browse` chain with `--js both`; `--as <name>` switches actors
  (`hozu docs testing`).
