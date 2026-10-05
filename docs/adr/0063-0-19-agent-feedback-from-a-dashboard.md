# ADR 0063 — 0.19: what an agent building a dashboard found

- **Status:** accepted (owner, 2026-10-06: "全部做"; on B: "B正常不會做，是因為文件誤導 … 連問要存哪裡都沒問就這樣做，
  代表是文件很有問題 … 你文件導致agent做了不可能會做的事情").
- **Source:** an agent built a stock watchlist (quotes from a public API, a personal watchlist, charts, a 30 s
  refresh) from the 0.18.2 skill alone, and reported what it hit.

## B — the guide taught agents to keep app data in server memory
- **Problem:** the agent kept each visitor's watchlist in one server-side list (`scope: 'public'`, `access: 'anyone'`,
  then `data/watchlist.json`): every visitor shared and overwrote one list. An agent on Nuxt or Next asks where data
  lives, or uses a database; this one did not ask, because every Hozu example stores data in a module-level array
  (`example/app.ts`, `topics/feature.md`, `topics/data.md`, `topics/recipes.md`, the `hozu add feature` scaffold), and
  nothing says that this is a stand-in. `SKILL.md`'s only list recipe said "stored on the server", the only
  browser-storage row in `topics/fetch.md` spoke of credentials, and 0.18.2's `data.md` line "Keeping data in a file
  … is fine" read as advice.
- **Options:** a warning on public mutations that anyone may run (it would flag comments and guest books, which are
  shared on purpose, and treats the symptom); or the guide stops teaching it.
- **Decision:** the guide stops teaching it; no new diagnostic.
  - `SKILL.md` gains a rule: where data lives is the person's decision; when the request does not say, ask. A
    stand-in store (a module-level array) is for examples only.
  - `topics/data.md` opens with "Whose data is it?": the visitor's own without sign-in → the browser (`runs:
    'browser'`, `scope: 'user'`, `localStorage` in `fetch.ts`); a user's across devices → the server with a session
    and a database; everyone's → the server with a database and a deliberate `access`; a public third-party API →
    `'either'`.
  - A recipe "A personal list without sign-in", with the common split: the list in the browser, the quotes from a
    server query.
  - Every stand-in store is named for what it is (`demo…`) and the scaffold's `next` line says to replace it with the
    app's database. The 0.18.2 line about data files goes; the dev-reload note stays in the CLI page.
  - `examples/watchlist` is the runnable reference (B, C1, C2).

## C1 — re-reading on a timer: `freshness: { poll: seconds }`
- **Problem:** `'live'` is pushed by invalidation only; a 30 s quote refresh needed a mutation whose only job was to
  invalidate, driven by a machine timer.
- **Options:** the server re-reads on a timer and pushes over the live stream; or the page reads again on a timer.
- **Decision:** `freshness: { poll: s }` (s ≥ 5, HZ014 otherwise), for any `scope` and any `runs`. The region is a
  client region like `'live'`; the page carries `payload.poll` (query → seconds, for the queries of its features) and a
  lazily loaded `poll.ts` reads every polled query on the page again on its timer, through the page's own query path,
  so queries the browser fetched itself (inside another region) and `runs: 'browser'` queries poll too. It skips while
  the page is hidden or an effect is in flight. On the server, public polled data is cached for half the interval, so
  every page showing it shares one read; user data is never cached (HZ049 allows `{ poll }`).
- The server-push option needs a timer per key and per instance and still only covers server-run queries; the client
  timer covers every case with the existing read path.

## C2 — back to the state it came from: `target: 'previous'`
- **Problem:** to come back to "paused" after an add, every busy state was doubled (`adding` / `addingPaused`, …).
- **Options:** history targets; parallel regions (a larger change to the machine model).
- **Decision:** `target: 'previous'` on a transition (an event, `done`, `failed`, `after`) returns to the state the
  machine was in before it entered the current one. The interpreter keeps it in the snapshot (`previous`, only for
  machines that use the target, so other payloads stay as they were); a re-entry of the same state keeps it, and with
  nothing to return to the transition does not fire. Contracts take `given.previous` (HZ016 suggests one), the lock
  prints `--> previous`, a `'previous'` target in a state no transition enters from another state is HZ007, and a
  state named `previous` is HZ014. Parallel regions are not in 0.19.

## C3, D1 — seeing what a step did
- **Decision:** `hozu browse` reports per step whether the document reloaded, navigated, or changed in place (and
  which client regions were replaced); `hold <feature>.<effect>` keeps that effect's answer until `release`, so the
  pending state can be read and screenshot. The guide says what `browse` does not run: `hozu dev`'s watcher and
  DevTools.

## D2 — removing a guard
- **Decision:** a transition that stops deciding (its guard, `navigate` or `fn` value removed) is reviewed by the lock
  alone: HZ018 no longer asks for a covering contract there, and says to run `hozu check --update-lock` and delete the
  contracts HZ058 then names.

## D3 — a boolean field as a guard
- **Decision:** `guard: () => ctx.auto` is accepted: a field alone is a condition, lowered like an operand of `&&`
  (`%truthy`), so `() => ctx.auto` and `() => ctx.auto && ctx.ready` read the field the same way.

## D4 — SVG elements without children
- **Decision:** SVG shape and gradient elements (`path`, `line`, `circle`, `rect`, `ellipse`, `polygon`, `polyline`,
  `stop`, `use`) take their children argument as optional, like void HTML elements.
- **Gap:** SVG `<use>` itself cannot be written: `ui.use` is the component call. It stays out of 0.19; a sprite is an
  `ui.asset` image or inline paths.

## E1 — `browse` targets by accessible name
- **Decision:** a click / fill target matches the element's accessible name (`aria-label`, then the text without
  `aria-hidden` parts), and the visible text as before.

## E2 — formatting in views
- **Decision:** documentation: `ui.format.number / date / relative / list` were in the i18n topic only; the views topic
  lists them.

## E3 — fonts
- **Decision:** `@hozu/css` moves `@import url(…)` rules to the top of the stylesheet, where CSS requires them, and
  the guide shows a remote font (the CSP sources it needs) and recommends local font files.

## A2 — a release that cannot install for a while
- **Problem:** `@hozu/cli` depends on `create-hozu` (the skill files and the agent-file writer), and `create-hozu`'s
  apps depend on `@hozu/cli`: whichever goes first, one points at a version npm does not show yet.
- **Decision:** the build copies what the CLI uses from `create-hozu` into `@hozu/cli` (a generated module, checked by
  a test like the skill copies), so `@hozu/cli` no longer depends on `create-hozu`, and `create-hozu` goes last.

## A1
- Done in 0.18.2: the dev terminal and the page's console name the files behind a reload.
