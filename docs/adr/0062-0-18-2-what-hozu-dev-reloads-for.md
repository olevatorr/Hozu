# ADR 0062 — 0.18.2: what `hozu dev` reloads for

- **Status:** implemented (owner, 2026-10-05: "A 可以，開始做 然後直接做到完 review後沒問題就發佈").
- **Report:** an app whose mutation resolver writes `<project>/data/watchlist.json` reloaded the whole page under
  `hozu dev` after every successful mutation, instead of refreshing the invalidated queries in place. `hozu browse`
  (no watcher) never showed it.

## Problem
`hozu dev` restarted the app and reloaded the page for any `.ts`, `.css` or `.json` file that changed in the project
(except `node_modules`, `dist`, `.git`, `.hozu`). A data file the app writes at runtime is such a file. Worse than
reported: the restart also emptied everything the app keeps in memory, `memorySessions()` included, so every
mutation also signed the person out. `.env` files, which the app does read, were not watched at all.

## Options
1. **What the app loaded:** the app process reports every project file it imports; only those reload.
2. Default ignore folders (`data/`, `*.db`) plus a `project({ dev: { ignore } })` option: a guess, and a second way
   to say what is source.
3. Documentation only: keep data files outside the project.

## Decision
1. Under `hozu dev`, the app process starts with `--import` of `@hozu/dev`'s `graph.js`, which registers a `load` hook (the
   asynchronous `module.register`, as `@hozu/transform` does: Node 22's synchronous `registerHooks` cannot be chained
   with it and broke `@hozu/css`). The hook reports each project file it loads, outside `node_modules`, over IPC.
2. A change reloads when the file is one the app loaded, a stylesheet (`.css`, hot-swapped as before), an env file
   (`.env`, `.env.*`), `package.json` or `tsconfig.json`. A source file the app never imported (a new one) reloads
   once a loaded file imports it, which is the edit that wires it in.
3. While the app is not running (it failed to start), any `.ts` / `.json` change reloads, as before, so fixing the
   error still restarts it.
4. What Node never imports is reported too: `hozu serve` sends the files esbuild read for the browser bundle
   (`ComponentBundle.inputs`: client components, `fetch.ts`, and what they import) and the env files `env.files`
   named. Found in review: the first version saw only Node's imports, so editing a client component or a
   browser-run `fetch.ts` no longer reloaded.
5. The reload event names the files, and the page logs `[hozu dev] reloaded: <files> changed` after it reloads.

## Results
- `packages/dev/test/dev.test.ts`: a request that writes `data/store.json` and a `.ts` file the app never imports
  sends nothing; editing an imported `lib.ts` reloads with `{"files":["lib.ts"]}`; writing `.env` reloads. Fails
  before the fix.
- The same file: editing `features/stations/map.client.ts` in a copy of `examples/stations`, and the browser-run
  `features/stars/fetch.ts` in a copy of `examples/stars`, reloads (fails without `inputs`).
- A copy of `examples/notes` under `hozu dev`: writing `data/store.json` sends nothing; editing
  `features/notes/views.ts` reloads.
