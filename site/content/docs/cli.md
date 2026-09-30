---
title: CLI
description: Check, inspect and exercise your app from the terminal.
order: 6
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
| `hozu check --json` | Check TypeScript, framework rules and contracts. |
| `hozu validate --json` | Build and validate the IR, including contracts. An optional feature name narrows the target. |
| `hozu map --json` | Show a compact app outline with source locations. |
| `hozu inspect tasks --json` | Inspect a feature's canonical IR and summary. |
| `hozu graph tasks --json` | Inspect state, effect and view relationships; ordinary output is Mermaid. |
| `hozu explain tasks.idle --json` | Explain a state, its transitions, guards, effects and covering contracts. |
| `hozu impact tasks.listItems --json` | Find what a declaration affects. Use your actual declaration name. |
| `hozu plan home --json` | Show the derived render plan for a named route. |
| `hozu get /tasks --json` | Request one or more pages in-process without a server. |
| `hozu post /tasks --field title=Hello --json` | Submit a page's native form and follow its redirect. |
| `hozu browse /tasks --do 'click Save' --json` | Load a page in headless Chrome without a server: errors, widgets and text after the steps. |
| `hozu build --json` | Write deployment assets, generated server rendering code and the manifest. |
| `hozu serve` | Start the app module on `PORT` with adapter-node; this is `npm start`. |
| `hozu docs forms` | Print one topic of the installed guide; `hozu docs` lists the topics. |
| `hozu add widget tasks Chart --json` | Add a widget: declaration, client module, the bundle in `app.ts` and the `@hozu/bundle` dependency. |
| `hozu skill --agent both --json` | Refresh the installed authoring skill and agent instructions. |

Use `hozu --help` for the options supported by your installed version. `--config` points to a different configuration file, and `build --out` chooses the output directory.

## Inspect pages without a server

`get` reports the status, title, alerts and visible text. `--full` removes the text truncation. `--select` inspects matching elements and their attributes; `--forms` lists native forms, fields, defaults and buttons.

```sh
npx hozu get /tasks --select a --forms
npx hozu get /tasks --select 'button[aria-pressed=true]'
npx hozu post /tasks --field title=Hello --next /tasks
```

Each invocation starts with fresh in-memory data. Use repeated `--next` steps when requests must share state. A step can be a path, `GET /path`, `POST /path title=Hello`, or `POST /path @Button label`. Use `--button` to choose an action form by its submit button.

These commands run the real request handler. They do not run client code: for that, use `browse`.

## Check the browser without a server

`browse` loads a page in the installed Chrome, Chromium or Edge. It does not start a server: the browser's requests are answered by the same in-process handler, so no port is opened.

The command waits for hydration, then runs the `--do` steps in order:
- `fill <label>=<value>`, `select <label>=<option>` and `check <label>`;
- `click <name>` and `press <key>`;
- `wait <ms>` and `goto <path>`.

It then reports:
- uncaught exceptions, `console.error` calls and failed requests;
- every widget on the page: mounted, failed or not mounted, with its size and canvases;
- the visible text and any `--select` elements.

The exit code is 1 when anything failed.

```sh
npx hozu browse / --do 'fill Search=park' --do 'click Tech Park' --select canvas
npx hozu browse / --reduced-motion --screenshot shot.png
```

Set `HOZU_CHROME=/path/to/chrome` when the browser is not in a standard location.

## Understand the design

Read [How Hozu works](/how-it-works/pipeline) for the decisions behind this API and their trade-offs.
