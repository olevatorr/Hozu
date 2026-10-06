---
name: hozu
description: Build or change an app with the Hozu framework (packages @hozu/*, files like hozu.config.ts, features/*/model.ts, views.ts). Use it before writing any Hozu code. It is the complete authoring reference, so you do not need to read the framework source.
---

# Hozu

Hozu is not in your training data: this file and `npx hozu docs <topic>` are the whole API (skip
`node_modules/@hozu`). Diagnostics teach the other rules: apply their fix.

## The change loop
1. `npx hozu map`: the session, the verify line, each file's role and declaration's `file:line`; open only the
   lines you change. A new app: `npx hozu add feature <name> --page / --with …`, then
   `npx hozu docs feature`.
2. Edit everything the change needs (table below).
3. `npx hozu check` once. For an intended behaviour change, `npx hozu check --update-lock`, then list the accepted
   `now:` lines in your summary.
4. Verify once with the line `hozu map` prints: `npx hozu browse <path> --session '…' --do '…'` (no server, no
   `curl`).
5. Show the person the change: `npx hozu show <file:line> --note "<in their words>"`.

## What to touch
| Change | Touch |
|---|---|
| UI-only state (a tab) | model: a context field, an event, an `on` whose `assign` sets it → views: the control |
| Filter / sort in the URL | the route's `search` (with a default) → `ui.link(route, params, { key })` → `search.key`; while typing: `seed` the machine from `search` |
| A per-item action (pin, archive) | model: the item field, an event, a mutation that `invalidates` the list tag, an `on` into a state with `invoke` → views: the per-item form (`hozu docs patterns`) |
| A control every state handles | `machine({ on: [...] })` |
| Refresh (a button, a timer) | `refresh: () => [tag()]` on a transition |
| New page | `routes.ts` → a view with `route` → `ui.page(...)` in `hozu.config.ts` |
| UI (a button, a field) | `ui.use` of a kit component (`npx hozu docs components`) |

## Rules no diagnostic checks
- **Ask where data lives when it could be shared or follow a user across devices.** The visitor's own (drafts,
  preferences) → `'browser'` (`localStorage` in `fetch.ts`); a user's across devices → session + database;
  everyone's → a database. Arrays in examples are stand-ins, never storage (`npx hozu docs data`).
- **Every query and mutation states `runs`:** a database, a secret or the session → `'server'` (resolver in
  `app.ts`); browser storage or credentials → `'browser'`; a public API → `'either'` (`fetch.ts`).
- **Query resolvers only read.** Writes belong in mutations and endpoints.
- **Other users, reloads, sign-out:** verify in one `browse` chain, `--as <name>` per user.
- **Contracts only where a transition decides:** a guard, `navigate` or a computed value (`+=` too); the lock has
  the rest.
- **`invalidates` drives the client refresh** of the queries with those tags; `'live'` only for push.
- **`previews.ts` is for people:** read it only if asked or when HZ092 names a line.

## Topics (`npx hozu docs <topic>`; `--more`: options, edge cases)
| Task | Topic |
|---|---|
| a new feature, the files, a complete example | `feature` |
| elements, attributes, events, lists, links, reuse | `views` |
| states, events, invoke, timers, guards | `machine` |
| queries, mutations, tags, `fn()`, resolvers | `data` |
| where effects run, `fetch.ts`, browser storage, static hosts | `fetch` |
| contracts and the lock | `contracts` |
| routes, search, pages, `head`, 403 / 404 | `pages` |
| forms, checkboxes, bulk forms, no JS | `forms` |
| sign-in, sessions, per-user data | `auth` |
| filters, modes, per-item actions, load more | `patterns` |
| worked changes | `recipes` |
| webhooks, JSON APIs, redirects | `endpoints` |
| components, kits, browser APIs, DOM libraries, `previews.ts` | `components` |
| languages, env, HTTP, Markdown, tests, deploying, upgrading Hozu | `i18n` `env` `http` `content` `testing` `deploy` |
| a diagnostic code | `diagnostics` |
| requests from Hozu DevTools; showing a change (`hozu show`) | `requests` |
