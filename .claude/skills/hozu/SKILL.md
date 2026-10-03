---
name: hozu
description: Build or change an app with the Hozu framework (packages @hozu/*, files like hozu.config.ts, features/*/model.ts, views.ts). Use it before writing any Hozu code. It is the complete authoring reference, so you do not need to read the framework source.
---

# Hozu

Hozu is not in your training data: this file and `npx hozu docs <topic>` are the whole API (skip
`node_modules/@hozu`). Diagnostics teach the other rules when you break them: apply their fix.

## The change loop
1. `npx hozu map`: the session shape, the verify line, every file's role, each declaration's `file:line`. Open
   only the lines the change touches. A new app: `npx hozu add feature <name> --page / --with …`, then
   `npx hozu docs feature`.
2. Edit everything the change needs (table below).
3. `npx hozu check` once. For an intended behaviour change, `npx hozu check --update-lock`, then list the accepted
   `now:` lines in your summary.
4. Verify once with the line `hozu map` prints: `npx hozu browse <path> --session '…' --js both --do '…'`. It runs
   the same app as `npm start`, with and without JS; do not start a server or use `curl`.

## What to touch
| Change | Touch |
|---|---|
| UI-only state (a tab) | model: a context field, an event, an `on` whose `assign` sets it → views: the control |
| Filter / sort in the URL | the route's `search` (with a default) → `ui.link(route, params, { key })` → `search.key`; filtering while typing: `seed: ({ search }) => ({ key: search.key })`, read `ctx.key` |
| A per-item action stored on the server (pin, archive) | model: the item field, an event, a mutation that `invalidates` the list tag, `on(E, { target: 'pinning', assign: (e) => { ctx.target = e.id } })`, a state with `invoke` → views: the per-item form (`hozu docs patterns`) → app: store it, sort in the list resolver |
| A control every state handles | `machine({ on: [...] })` |
| New page | `routes.ts` → a view with `route` → `ui.page(...)` in `hozu.config.ts` |
| UI (a button, a field) | `ui.use` of a kit component; the catalog: `npx hozu docs components` |

## Rules no diagnostic checks
- **Every query and mutation states `runs`:** a database, a secret or the session → `'server'` (resolver in
  `app.ts`); the visitor's browser credentials → `'browser'`; a public API → `'either'`, implemented in the feature's
  `fetch.ts` (`npx hozu docs fetch`).
- **Query resolvers only read.** Writes belong in mutation and endpoint resolvers; a prefetched link runs queries.
- **Other users, reloads, sign-out:** verify them in one `browse` chain with `--js both` (`--as <name>` per user).
- **Contracts only where a transition decides:** a guard, a `navigate`, a `fn` or computed value. Copy-only
  transitions are reviewed in the lock.
- **`'live'` only for push** to pages that are already open.
- **`invalidates` drives the client refresh** of every query with those tags, whatever its freshness.

## Topics (`npx hozu docs <topic>`)
| Task | Topic |
|---|---|
| a new feature, the files, a complete example | `feature` |
| elements, attributes, events, lists, links, reuse | `views` |
| states, events, invoke, timers, guards | `machine` |
| queries, mutations, tags, `fn()`, resolvers | `data` |
| where effects run, `fetch.ts`, browser tokens, static hosts | `fetch` |
| contracts and the lock | `contracts` |
| routes, search, pages, `head`, 403 / 404 | `pages` |
| forms, checkboxes, bulk forms, no JS | `forms` |
| sign-in, sessions, per-user data | `auth` |
| filters, modes, per-item actions, load more | `patterns` |
| worked changes | `recipes` |
| webhooks, JSON APIs, redirects | `endpoints` |
| components, kits, browser APIs, DOM libraries | `components` |
| languages, env, HTTP, Markdown, tests, deploying, upgrading Hozu | `i18n` `env` `http` `content` `testing` `deploy` |
| a diagnostic code | `diagnostics` |
| change requests from Hozu DevTools (`.hozu/requests`) | `requests` |
