# Changing a Tenon app

Keep the loop short: read once, edit everything, check once, verify once.

## 1. Read
- The change request.
- The app: `features/<name>/*.ts`, `server.ts`, `routes.ts`, `tenon.config.ts`.
- Nothing else. The API is in `SKILL.md`; open `patterns.md` only for a pattern you have not seen in the app.

## 2. Where each kind of change goes
| Change | Touch, in this order |
|---|---|
| New data field (e.g. `priority`) | `schemas.ts` (domain schema and input schemas) → `server.ts` (seed data, store it) → `views.ts` (show it) → the detail view if there is one. If the user picks it in a form: a `<select name="…">` inside the form, sent with the submit as `ui.dom.form('…')` (TN033 checks the options), plus the matching field in the event payload and the mutation input. |
| New server action (e.g. "clear done") | `effects.ts`: a `mutation` with `invalidates` → `feature.ts` (register it) → `events.ts`: an event → `machine.ts`: `on(Event)` into a new busy state that `invoke`s the mutation, with `done` and every `failed` handled, and the same `ignore` list as the other busy states → `views.ts`: the control → `server.ts`: `implement(...)` it. |
| New UI-only state (a filter, a tab) | `schemas.ts` (context field and its enum) → `machine.ts` (initial context, an `on` that `op.set`s it; add the event to every busy state's `ignore`) → `views.ts`. |
| New page | `routes.ts` → a view with `route` → `ui.page(...)` in `tenon.config.ts` (with `head` and `entries`). |

Whenever the machine changes:
- Update the contracts: add the new context field to the shared `given` / `expect` constants, and add one
  contract per new transition. TN016 prints each missing contract ready to paste.
- Every busy state `ignore`s every event its visible controls can send. TN005 prints the missing `ignore` entries.

## 3. Check (once, after all edits)
```
pnpm exec tsc --noEmit -p . && pnpm exec tenon validate
```
Fix what they report. When the behaviour change is intended and everything is clean, run
`pnpm exec tenon validate --update-lock`. TN018 asks for this.

## 4. Verify (once)
Start the server with `PORT=4700 node serve.ts & echo $!`, then use one curl script:
- pages: `curl -s localhost:4700/…`;
- mutations:
  `curl -s -X POST localhost:4700/_tenon/effect -H 'content-type: application/json' -d '{"effect":"<feature>.<mutation>","input":{…},"keys":[]}'`.

Stop the server with `kill <pid>`, not `pkill -f` (that kills your own shell).
