---
title: CLI
description: Check, inspect and exercise your app from the terminal.
order: 13
---

## The daily loop

Run commands from the application directory. Use `npx hozu` with npm or `pnpm exec hozu` with pnpm. Every command below accepts `--json` for machine-readable output; schemas ship with `@hozu/cli`.

```sh
npx hozu map --json
npx hozu check --json
npx hozu get / --json
```

`check` combines TypeScript checking with validation and contracts. Read diagnostics before updating the behaviour lock. Use `check --update-lock` only when the behaviour change is intended and the checks are clean.

## Command reference

| Command | Purpose |
| --- | --- |
| `hozu add feature tasks --page /tasks --json` | Scaffold a feature and optionally its page. `--with detail,toggle,filter,remove,auth` adds composable behaviours. |
| `hozu check --json` | Check TypeScript, framework rules and contracts. `--no-types` skips TypeScript; `--update-lock` accepts a behaviour change. (`hozu validate` was removed in 0.14.) |
| `hozu map --json` | Show a compact app outline with source locations. |
| `hozu inspect tasks --json` | Inspect a feature's canonical IR and summary, or a component (`ui.Button`) with every use. |
| `hozu why tasks.listItems --json` | What a target is, where it is (file:line), what uses it and what it affects. The target is a declaration, a component (`ui.Button`), a state (`tasks.idle`: its transitions, guards and covering contracts), a view node (a DevTools id, an IR pointer, or `views.ts:42`: the outermost node written on that line; a line two files share is refused with both paths) or a page (`page:home`). `explain`, `impact` and `locate` were removed in 0.15, and `graph` in 0.14. |
| `hozu plan home --json` | Show the derived render plan for a route name, or for a path such as `/products/mug`. |
| `hozu get /tasks --json` | Request one or more pages in-process without a server. |
| `hozu gen --json` | Write the contract of every `remote()` in `app.ts`: a Go file with the types, the `Resolvers` interface and the HTTP handler. Run it after changing a remote effect's declaration; `hozu check` reports a stale contract as HZ093. See [Resolvers in Go](/docs/go). |
| `hozu env --json` | Every env variable: server or public, required, default, whether it is set now, its internal URL; `--example` writes `.env.example`. |
| `hozu call tasks.listItems --input '{}' --json` | Run one query or mutation through the app's handler without a server: the value or the declared error, and for a mutation (`--write`) the tags it invalidated and the queries they refresh. `--session '<json>'` signs in. An endpoint takes `--header 'Authorization: Bearer …'` and prints its status; a POST endpoint needs `--write` and prints the tags it invalidated. |
| `hozu browse /tasks --do 'click Save' --json` | Run steps in headless Chrome without a server (with JS; `--js off` or `both` for a page that must also work without it): what each step changed, errors and client components. `--as <name>` adds actors, `--header` adds a request header (to every actor, or to one after its `--as`), `remember <name> from url|<selector>` keeps a value for `$name` in later steps, and `post <path> a=1` forges a native form post. `--viewport 390x844` opens at a phone's size, `--screenshot <file>` saves a PNG after the steps. |
| `hozu build --json` | Write deployment assets, generated server rendering code and the manifest. |
| `hozu export --json` | Write every page as files for a static host to `dist/` (`--out` elsewhere), with `.nojekyll`; it exits 1 and names each page and server effect a static host cannot answer. See [Deploying](/docs/deploying). |
| `hozu serve` | Start the app module on `PORT` with adapter-node; this is `npm start`, and it prints `stop: kill <pid>`. It runs as production unless `NODE_ENV` is set, so an app with sessions needs `SESSION_SECRET`. |
| `hozu dev` | Start the app with [Hozu DevTools](/docs/devtools); this is `npm run dev`. It restarts the app and reloads the page when a file the app loads, a stylesheet (swapped in place), an env file, a client component or `fetch.ts` (what the browser bundle reads), `package.json` or `tsconfig.json` changes; files your resolvers write, such as a `data/` folder, do not reload it. `--devtools-messages <file>` (or `HOZU_DEVTOOLS_MESSAGES`) shows DevTools in your language. |
| `hozu devtools messages` | Print every DevTools string as JSON to translate; `--check <file>` lists what a translation lacks or no longer needs. |
| `hozu requests` | List the requests saved from DevTools; `done <n> --result` closes one. |
| `hozu show views.ts:42 --note "…"` | Show the person a note on that part of their page under `hozu dev` (a `file:line`, a DevTools id or `page:<route>`; `--in "<text>"` frames one row of a list). `hozu show` lists the notes and marks one `STALE` when its id names another part now; `--done <n>` removes one, `--clear` all. |
| `hozu <command> --help` | Print one command's usage and options. |
| `hozu docs forms` | Print the short form of one topic of the installed guide; `--more` adds its options and edge cases. `hozu docs` lists the topics. |
| `hozu docs HZ083` | Print one diagnostic: its cause, its fix and the topic to read. |
| `hozu docs components` | Print the components topic, then every component of the app with its tag and variants. |
| `hozu render ui.Button --variant tone=ghost --json` | Render one component alone: its HTML, root class, owned CSS properties and diagnostics. `--props '<json>'` and `--slot name=text` fill it. |
| `hozu add kit ui --json` | Add a component kit: `ui/kit.ts`, `ui/tv.ts` and `project({ kits })`; `--sync` regenerates the tailwind-merge config. |
| `hozu add component ui Button --json` | Add a component to a kit or a feature; `--client` adds the client module, the bundle in `app.ts` and the `@hozu/bundle` dependency. |
| `hozu skill --agent both --json` | Refresh the installed authoring skill and agent instructions. |
| `npx -p @hozu/cli@latest hozu migrate --dry-run` | Upgrade the app from 0.10.0 on: rewrite the source and raise `@hozu/*`; after installing, `hozu migrate` again checks the IR did not change, refreshes the skill and runs `hozu check`. It never writes the lock. |

Use `hozu --help` for the options supported by your installed version. `--config` points to a different configuration file, and `build --out` chooses the output directory.

## Inspect pages without a server

`get` reports the status, title, alerts and visible text, and the server errors the request caused. `--full` removes the text truncation. `--select` inspects matching elements with their attributes and `class`; it takes attribute operators (`^= $= *= ~=`) and descendant and child combinators (`nav a[aria-current]`, `main > form input`). `--select script` prints the head's scripts raw, to check the JSON-LD. `--forms` lists native forms: fields and defaults, checkbox and radio groups with every value, controls that join a form through `form=`, and submit buttons with their name and value.

```sh
npx hozu get /tasks --select a --forms
npx hozu get /tasks --select 'button[aria-pressed=true]'
```

It runs the real request handler and needs no browser. It does not run client code or submit forms: for that, use `browse`.

`get`, `browse` and `call` show an unexpected error's message. A production server (`NODE_ENV=production`) answers `Internal error` there instead, with the call id of a Go service, and `onError` keeps the full message; `get` and `browse` say so once.

## Check the browser without a server

`browse` loads a page in the installed Chrome, Chromium or Edge. It does not start a server: the browser's requests are answered by the same in-process app, so no port is opened. Without a browser it is a configuration error; `get` stays the browser-free read.

It runs the `--do` steps with JavaScript and reports per step only the lines that step added or removed (`--js off` runs them with JavaScript switched off, `--js both` side by side, for a page that must also work without it):
- `fill <label>=<value>`, `select <label>=<option>`, `check <label>` and `uncheck <label>`;
- `click <name>`, `submit "<form>"` and `press <key>`;
- `wait <ms>` and `goto <path>`;
- `hold <feature>.<effect>` and `release`: keep that effect's answer back, to read and screenshot the pending state;
- `post <path> a=1&b=2`: a forged native form post as the current actor, without the page;
- `remember <name> from url|<selector> [@attr]`: keep a value that later steps read as `$name`;
- any target may end with `in "<text>"`: the smallest list item, table row or form containing that text (for `fill` and `select`, before or after `=value`).

Each step says whether the page reloaded, navigated or changed in place (`--full` adds how many elements were redrawn), and reports elements rebuilt unchanged or a layout shift no input explains. An element that moves to another parent, such as a Load more button under the next page, is not counted as rebuilt. A navigation names how the page arrived and its time to the first paint: `→ /products/mug (loaded, 32 ms)`, or `prerendered`.

A click that would land on another element fails and names it, as a person's click would: `the click would land on <h3>, which contains it (a ::before or ::after above it, …), above <a href="/products/mug">: a person cannot click it`. Fix the covering element rather than the step. Click and fill targets match the visible text and the accessible name (`aria-label`, or the text without `aria-hidden` parts). `browse` runs the built app, not `hozu dev`: its file watcher and DevTools are not part of a run.

One `--do` may hold several steps joined with `;` (outside quotes, before a step's verb). A target that is not on the page prints `Did you mean "<closest label>"?`. A step that loads a page answering 401, 403, 404 or 410 shows that status as its answer, such as `→ /notes/n1 (403)`, and is not an error, so an access check exits 0; the start page must still load.

A step with no native effect prints `js-only (<reason>)` in the no-JS column. A step where both modes made a request and the resulting text differs is marked `≠ DIFFERS`. `--as <name>` starts another actor with its own browser and optional `--session`; all actors share one in-process app, and live updates on their pages are printed under the step that caused them. `--header 'Name: value'` adds a request header: before the first `--as` to every actor, after an `--as` to that actor. Another visitor's data is one chain: `--as ada --do 'remember note from li a @href' --as bob --do 'goto $note'`.

It also reports uncaught exceptions, `console.error` calls, CSP violations and failed requests, every client component on the page, the final visible text and any `--select` elements. A passing six-step run prints less than 1.5 KB.

The exit code is 1 when anything failed.

```sh
npx hozu browse / --do 'fill Search=park' --do 'click Tech Park' --select canvas
npx hozu browse / --reduced-motion --screenshot shot.png
npx hozu browse / --viewport 390x844 --screenshot phone.png
```

Set `HOZU_CHROME=/path/to/chrome` when the browser is not in a standard location.

## Understand the design

Read [How Hozu works](/how-it-works/pipeline) for the decisions behind this API and their trade-offs.
