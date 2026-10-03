---
title: CLI
description: Check, inspect and exercise your app from the terminal.
order: 7
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
| `hozu why tasks.listItems --json` | What a target is, where it is (file:line), what uses it and what it affects. The target is a declaration, a component (`ui.Button`), a state (`tasks.idle`: its transitions, guards and covering contracts), a view node (a DevTools id or IR pointer) or a page (`page:home`). `explain`, `impact` and `locate` still work in 0.14 with a deprecation, and are removed in 0.15; `graph` was removed. |
| `hozu plan home --json` | Show the derived render plan for a named route. |
| `hozu get /tasks --json` | Request one or more pages in-process without a server. |
| `hozu env --json` | Every env variable: server or public, required, default, whether it is set now, its internal URL; `--example` writes `.env.example`. |
| `hozu call tasks.listItems --input '{}' --json` | Run one query or mutation through the app's handler without a server: the value or the declared error, and for a mutation (`--write`) the tags it invalidated and the queries they refresh. `--session '<json>'` signs in. |
| `hozu browse /tasks --do 'click Save' --json` | Run steps in headless Chrome without a server, with and without JS: what each step changed, errors and client components. |
| `hozu build --json` | Write deployment assets, generated server rendering code and the manifest. |
| `hozu serve` | Start the app module on `PORT` with adapter-node; this is `npm start`. |
| `hozu docs forms` | Print one topic of the installed guide; `hozu docs` lists the topics. |
| `hozu docs components` | Print the components topic, then every component of the app with its tag and variants. |
| `hozu render ui.Button --variant tone=ghost --json` | Render one component alone: its HTML, root class, owned CSS properties and diagnostics. `--props '<json>'` and `--slot name=text` fill it. |
| `hozu add kit ui --json` | Add a component kit: `ui/kit.ts`, `ui/tv.ts` and `project({ kits })`; `--sync` regenerates the tailwind-merge config. |
| `hozu add component ui Button --json` | Add a component to a kit or a feature; `--client` adds the client module, the bundle in `app.ts` and the `@hozu/bundle` dependency. |
| `hozu skill --agent both --json` | Refresh the installed authoring skill and agent instructions. |
| `npx -p @hozu/cli@latest hozu migrate --dry-run` | Upgrade the app from 0.10.0 on: rewrite the source and raise `@hozu/*`; after installing, `hozu migrate` again checks the IR did not change, refreshes the skill and runs `hozu check`. It never writes the lock. |

Use `hozu --help` for the options supported by your installed version. `--config` points to a different configuration file, and `build --out` chooses the output directory.

## Inspect pages without a server

`get` reports the status, title, alerts and visible text. `--full` removes the text truncation. `--select` inspects matching elements and their attributes; `--forms` lists native forms: fields and defaults, checkbox and radio groups with every value, controls that join a form through `form=`, and submit buttons with their name and value.

```sh
npx hozu get /tasks --select a --forms
npx hozu get /tasks --select 'button[aria-pressed=true]'
```

It runs the real request handler and needs no browser. It does not run client code or submit forms: for that, use `browse`.

## Check the browser without a server

`browse` loads a page in the installed Chrome, Chromium or Edge. It does not start a server: the browser's requests are answered by the same in-process app, so no port is opened. Without a browser it is a configuration error; `get` stays the browser-free read.

By default (`--js both`) it runs the `--do` steps twice side by side, with JS and with JS switched off in the same browser, then reports per step only the lines that step added or removed:
- `fill <label>=<value>`, `select <label>=<option>`, `check <label>` and `uncheck <label>`;
- `click <name>`, `submit "<form>"` and `press <key>`;
- `wait <ms>` and `goto <path>`;
- any target may end with `in "<text>"`: the smallest list item, table row or form containing that text.

A step with no native effect prints `js-only (<reason>)` in the no-JS column. A step where both modes made a request and the resulting text differs is marked `≠ DIFFERS`. `--as <name>` starts another actor with its own browser and optional `--session`; all actors share one in-process app, and live updates on their pages are printed under the step that caused them.

It also reports uncaught exceptions, `console.error` calls, CSP violations and failed requests, every client component on the page, the final visible text and any `--select` elements. A passing six-step run prints less than 1.5 KB.

The exit code is 1 when anything failed.

```sh
npx hozu browse / --do 'fill Search=park' --do 'click Tech Park' --select canvas
npx hozu browse / --reduced-motion --screenshot shot.png
```

Set `HOZU_CHROME=/path/to/chrome` when the browser is not in a standard location.

## Understand the design

Read [How Hozu works](/how-it-works/pipeline) for the decisions behind this API and their trade-offs.
