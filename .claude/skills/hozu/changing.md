# Changing a Hozu app

Keep the loop short: read once, edit everything, check once, verify once.

## 1. Read
- The change request.
- The app: `features/<name>/*.ts`, `server.ts`, `routes.ts`, `hozu.config.ts`. Below, *model* is where the
  app keeps schemas, events, effects and the machine (`model.ts` in the recommended layout), and *views* is
  where it keeps views, contracts and `feature()`.
- Nothing else. The API is in `SKILL.md`; open `patterns.md` only for a pattern you have not seen in the app,
  and `reference.md` only for a topic it lists.

## 2. Where each kind of change goes
| Change | Touch, in this order |
|---|---|
| New data field (e.g. `priority`) | model: the domain and input schemas → `server.ts` (seed data, store it) → views: show it, also in the detail view if there is one. If the user picks it in a form: a `<select name="…">` inside the form, sent with the submit as `ui.dom.form('…')` (HZ033 checks the options), plus the matching field in the event payload and the mutation input. |
| New server action (e.g. "clear done") | model: a `mutation` with `invalidates`, an event, and `on(Event)` into a new busy state that `invoke`s the mutation, with `done` and every `failed` handled and the same `ignore` list as the other busy states → views: the control, the contracts, and both new declarations in `feature({ declarations })` → `server.ts`: `implement(...)` it. |
| New UI-only state (a filter, a tab) | model: the context field, its initial value, an event and an `on` that `op.set`s it (add the event to every busy state's `ignore`) → views: the control, a contract, the event in `declarations`. |
| New page | `routes.ts` (`params`, `search`) → a view with `route`, added to `declarations` → `ui.page(...)` in `hozu.config.ts` (with `head`, and `entries` when the route has params). |
| New filter / sort / page number that should be in the URL | the route's `search` schema (with a default) → links with `ui.link(route, params, { key: value })` → read `search.key` in the view. No machine change. |

Whenever the machine changes:
- Add one contract per new transition; HZ016 prints each missing one ready to paste. A new context field needs
  no change to existing contracts: `given` defaults to the initial context and `changes` lists only what changes.
- Every busy state `ignore`s every event its visible controls can send. HZ005 prints the missing `ignore` entries.

## 3. Check (once, after all edits)
```
pnpm exec tsc --noEmit -p . && pnpm exec hozu validate
```
Fix what they report. When the behaviour change is intended and everything is clean, run
`pnpm exec hozu validate --update-lock`. HZ018 asks for this.

## 4. Verify (once)
Start the server with `PORT=4700 node serve.ts & echo $!`, then use one curl script:
- pages: `curl -s localhost:4700/…`;
- mutations:
  `curl -s -X POST localhost:4700/_hozu/effect -H 'content-type: application/json' -d '{"effect":"<feature>.<mutation>","input":{…},"keys":[]}'`.

Stop the server with `kill <pid>`, not `pkill -f` (that kills your own shell).
