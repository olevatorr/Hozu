# Changelog

## 0.8.0 — close the escape hatches (ADR 0043, breaking)

Trial 0020 ran twenty sequential changes. Hozu 0.7 kept 10× less client JS than Nuxt, but its cost per change doubled
over the second half, and from step 16 both runs carried regressions that `hozu check` did not see: a deleted
account came back, a page hand-wrote its 403, bulk forms dropped values. 0.8 closes each hatch those apps left
through, and teaches an agent at the moment of a mistake instead of in a longer guide. Trial 0021 judges the release.

**Upgrade:** run `npx hozu migrate 0.8` before upgrading the packages. It lists the lock entries already stale under
0.7, rewrites what it can (below), rewrites the Hozu block of `CLAUDE.md` / `AGENTS.md`, and prints what it cannot.
Then upgrade, run `npx hozu check` and accept the lock with `npx hozu check --update-lock`. It never writes the lock
and never deletes a contract.

### Breaking changes
- **Data (A):** a user-scoped query is `freshness: 'request'` or `'live'` (HZ049, patch to `'request'`);
  `'request'` also replaces `{ revalidate: 0 }` for public data and makes the page per-request. `'live'` needs tags
  (HZ050). No per-session cache and no cross-request dedup. `server.revalidate([tag()])` takes tag uses and returns
  `{ entries, pages }`. Endpoints may declare `invalidates` (HZ062 on a GET endpoint, a warning).
- **Sessions (B):** a server-side store with an opaque signed id (`memorySessions()` by default); the cookie holds no
  payload, and sign-out revokes it. Production without `SESSION_SECRET` refuses to start. The effect response re-reads
  queries with the session after the mutation, and `/_hozu/live` sends a page only its own tags.
- **Forms (C):** `ui.dom.formAll(name)` reads every value; `ui.dom.form(name)` is the first value on both sides; the
  pressed submit button is part of the payload. `ui.formRef()` joins controls outside the form (a string `form`
  attribute is HZ014 with a patch). New: HZ054 single value for a list, HZ055 / HZ063 unknown field, HZ056 a submit
  button with a click send, HZ061 limits on a form payload. An endpoint form body is multi-valued where its input
  schema declares an array.
- **Pages and endpoints (D):** `head.redirects` is `head.failed`, which maps every declared error of the head query to
  a parameterless route (303) or 403 / 404 / 410 (HZ051). An endpoint's `output` is a schema, `'redirect'` or
  `'response'`; HTML from an endpoint is a 500 with HZ053. Endpoints gain `errors`, `failed`, `input: 'raw'`,
  `ui.link(endpoint, input)` and `exports`. A route no page renders is HZ052.
- **One app module (E):** `project({ app: new URL('./app.ts', import.meta.url) })`, default-exporting
  `app({ resolvers, session?, widgets? })`. `hozu serve` (`npm start`), `hozu check`, `hozu get` / `browse` and
  `testApp(app)` build from it; `serve.ts` and `createResolvers()` leave the apps. A default export that is not an
  `app(…)` is HZ045, now an error.
- **i18n (F):** `site.lang` keeps its unprefixed URLs, the other locales are prefixed, `/en/x` answers 308 `/x`.
  A route that starts with a locale segment is HZ060.
- **Lock and contracts (G):** the lock is version 2 and must equal the computed lock (HZ057, accepted with
  `hozu check --update-lock`). A deciding change is accepted only when a covering contract fails against the previous
  record. A contract over only copy-only transitions is HZ058 (a warning), an identical one HZ064. `ui.link(route,
  params)` takes `search` only when it differs from the defaults (`null` and `{}` are type errors).
- **Authoring (H):** `op.*` and the motion-less `ui.if` are removed: `c ? a : b` and `c && a` (a branch may be a
  list). Reusable view logic is `part((…) => …)`; a plain function or a global that receives a reference is HZ059, and
  the server refuses to start. `list.includes(v)` and the removal of a primitive (`filter((x) => x !== v)`) lower.
- **No soft navigation (I):** every internal link loads a document, with speculation prerender and the cross-document
  View Transition. `navigate.js`, `payload.soft` and budget P8 are gone.
- **Verification (J):** `hozu browse --js on|off|both` (default both), `--as <name>` actors each with their own
  `--session`, `in "<text>"` targets, `check` / `uncheck`, `submit "<form>"`. `hozu post` is removed (a usage error
  names `browse`). `hozu get`, `hozu browse` and `testApp` exit 1 with the diagnostics when the build has errors.
- **The guide (K):** SKILL.md is at most 4 KB (tested): the change loop, what to touch, the rules no diagnostic
  checks, and the topic index. `changing.md` is gone; `hozu docs feature` has the build example. `hozu map` starts
  with the session shape, the verify line and the files. The app's `CLAUDE.md` / `AGENTS.md` block sits between
  `<!-- hozu: … -->` markers that `hozu skill` and `hozu migrate 0.8` rewrite; a guide they do not recognise is printed
  and the command exits 1.
- **IR version 2**, lock version 2 and regenerated JSON Schemas.

### Behaviour changes with no diagnostic
- The Accept-Language negotiation is gone, and prefixed default-locale URLs answer 308.
- Everyone signs in once more after the upgrade (sessions move to the server-side store).
- `ui.dom.form` is first-wins on the client too, and JavaScript payloads now include the submitter.
- An invalid native post answers 400 and re-renders the page with the framework `Invalid` error.
- User data is no longer cached (budget P9, report-only, moves).
- Soft navigation is removed: every internal link loads a document.

### Also
- The examples, the site and the skill example drop the contracts HZ058 flags (95 in all; the negative
  specifications stay), and every example is clean under `hozu check`.
- `examples/notes` gains the 403 admin page, the bulk form (`formAll` + `formRef`) and German under (c).
- Every new diagnostic carries a patch or an exact snippet, except HZ051, where 403 vs 404 is an intent decision.

## 0.7.0 — write less (ADR 0041)

A study of trials 0016–0018 found the remaining cost is what an agent has to *write*.
- On the notes task the scaffold writes most of the app, and a build outputs about half of what Nuxt does.
- On the widget task nothing is generated: apps came out at 1.5–1.9× Nuxt's lines, and a change added 214–529 lines
  against 61.

Five things forced that code:
- a machine could not start from the URL (19–23 `ctx.typed ? ctx.search : search.q` per app);
- `fn` bodies could not share a helper (the same predicate 3–6 times);
- every declaration was imported and listed again;
- modes repeated their shared transitions;
- `changing.md` carried 5.6 KB of recipes into every change.

**Measured (trial 0019, two Claude runs per task, every check passing):**
- widgets: build 1.75× Nuxt (was 2.15×) and change 2.03× (was 3.46×);
- notes: build 1.14× (was 1.38×) and change 1.38× (was 1.45×).
  - A first run of the change measured 1.68×, because a recipe had left `changing.md`.
  - The re-run with that row restored is the 1.38× above.

### Changes
- **`seed`**: `ui.view({ machine, route, seed: ({ search }) => ({ q: search.q }) })`.
  - The page's machine starts with those context fields in the server render, hydration and no-JS posts.
  - Views read `ctx.q` only.
  - HZ048 reports an unknown field, a seed without a machine or route, and two seeding views on one page.
- **`fn` bodies may call helpers from their module:** functions and JSON constants that are themselves self-contained.
  - They are shipped with the `fn` in `fns.js`, and their source is part of the fn's `sourceHash`.
  - Imported names and `let` state stay HZ047.
- **`declarations` is a list of modules:** `feature({ id, intent, declarations: [model, views] })` with namespace
  imports, in a new `feature.ts`.
  - Every exported declaration is registered under its name. Schemas and helpers are ignored.
  - A name two modules declare is HZ013.
  - **The record form `declarations: { … }` is removed** (HZ014, with the module form as the fix).
    `hozu add feature` and `hozu add widget` write the new layout.
- **`machine({ on })`**: transitions shared by every state that is not busy or final and does not handle or ignore the
  event itself.
  - Without `target`, a shared transition stays in the state it fires in.
  - One contract covers every identical copy (HZ016).
- **`changing.md` is 3 KB:** the loop and a table of change kinds. The worked recipes are `hozu docs recipes`.
- **Fewer rejected first attempts** (counted from the `hozu check` output of trials 0017 and 0018):
  - **A contract's `given.context` is a patch over `initialContext`** (30 hits of TS2740 / HZ017).
    - `given: { state: 'touring', context: { touring: true } }` now works; nested objects merge and arrays replace, like
      `expect.changes`.
    - A full context still means the same as before, and the IR is unchanged.
  - **`ui.use(W, { props })` needs no `on: {}`** (13 hits of TS2741).
  - **A `ui.query` branch may return `null` to render nothing** (HZ014 and TS2322).
    - `failed: { Unexpected: () => null }` inside a `<select>` now leaves only the other options.
    - `ready` may return `null` too.
  - **The widgets topic says where a role or label goes:** on a wrapping element. `ui.use` stays the widget's props, events
    and classes, so there is one form (4 hits of TS2353).

## 0.6.0 — verify what the browser runs (ADR 0040)

Trial 0017 built a widget-heavy app (Leaflet, Chart.js, GSAP, Three.js).
- Every Hozu run was correct, but cost 2.65× Nuxt to build.
- Part of that went to what `check`, `get` and `post` cannot see: code that runs only in the browser.

**Measured (trial 0018, same task, two Claude runs, all checks passing):**
- building costs 2.15× Nuxt, was 2.65× (−19 %);
- changing is unchanged at about 3.5×;
- both runs verified with `hozu browse`, and neither wrote a browser script.

- **`hozu browse <path>`: a real browser, still without a server.**
  - It drives the installed Chrome, Chromium or Edge over the DevTools protocol. There are no dependencies and no
    port: requests go to the in-process handler.
  - It runs `--do` steps in order (`fill`, `select`, `check`, `click`, `press`, `wait`, `goto`, all addressed by the
    names a user reads).
  - It reports exceptions, `console.error` calls, failed requests, every widget (mounted, failed or not mounted,
    with its size and canvases), the text, `--select` elements and an optional `--screenshot`.
  - The exit code is 1 when anything failed.
- **HZ047: a `fn` body that uses a helper from outside `impl`.**
  - `fn` bodies are sent to the browser as source text. A module-level helper worked on the server and silently
    stopped every island in the browser, while `hozu check` stayed green.
  - It is now a build error with the names found, and the server refuses to start.
- **No favicon request without `site.icon`:** the head carries `<link rel="icon" href="data:,">`, so the console no
  longer shows a 404 that looks like a bug.
- **Widget hosts are marked** with `data-hozu-widget="<feature>.<Name>"` and `data-hozu-widget-state`
  (`loading`, `mounted` or `failed`), for `browse` and for any browser test.
- **`hozu add widget` next to a `file:` core tarball** now adds the bundle tarball, not the core one.

### Found while building `examples/stations` (the reference app for the widget trial)
- **A widget that first renders after a client-side change now loads.**
  - The page payload listed only the widgets the server rendered. A widget shown later (for example a details panel
    that fades in once a station is selected) had no client code, so it never mounted.
  - Every widget an island can render is now listed.
- **`fn()` calls are typed as their value,** like data in callbacks since 0.5, so `ctx.selected = nextStop({ … })`
  type-checks.

## 0.5.0 — ordinary TypeScript, a shorter guide, less to write (ADR 0037–0039)

A study of every trial transcript (ADR 0038) found that an agent's extra cost is mostly **reading the guide**: 45–75 %
of the gap to Nuxt. The calls it takes multiply that cost, while writing was already at parity. 0.5 removes the rules
the guide had to teach, and makes the rest findable in one step.

**Measured (trial 0016, notes app, four Claude runs per step plus one Codex run):**
- building costs 1.38× Nuxt and changing 1.45× (before 0.5: 1.80× and 1.81×);
- every run passed all 36 acceptance checks.

### Ordinary TypeScript in builder callbacks (ADR 0039)
- **What you can write:**
  - `===`, `!==`, `<`, `&&`, `||`, `!`, `??`, `c ? a : b` and template strings;
  - `+`, `-` and `.length`;
  - in `assign`: `ctx.x = v`, `ctx.n += 1`, `ctx.list.push(v)` and `ctx.list = ctx.list.filter((i) => i.id !== e.id)`.
- **How it works:** `@hozu/transform` lowers them to the same IR as the explicit `op.*` / `ui.if` forms, which keep
  working. `x ? node : node` and `x && node` become conditional nodes.
- **What is not lowered:** methods on data (`.map`, `.toUpperCase()`). They are HZ014, with the fix: `ui.each`, or a
  `fn()`.
- **Where it runs:**
  - `npm start` runs `node --import @hozu/transform/register serve.ts`, and the CLI registers it itself;
  - `hozuTransform()` is available for Vite / Vitest (`@hozu/transform/vite`) and esbuild (`@hozu/transform/esbuild`).
- **HZ044:** a view or machine loaded without the transform. The server refuses to start, instead of silently
  comparing placeholders.
- **Types:** data in callbacks is typed as its value (`ctx.error: string | null`). Type instantiations for the cart
  fell from 61.7 k to 55.0 k.

### The guide (ADR 0038 R1, R2)
- **The skill is smaller:** `SKILL.md` went from 10.2 KB to about 5.8 KB. It has a complete feature example, checked by
  a test, and a task index.
- **Topics:** `hozu docs <topic>` prints one short topic (views, machine, data, forms, auth, …). With no topic, it
  lists them.
- **Pointers:** every diagnostic ends with `see: hozu docs <topic>`.
- **No server needed:** `hozu get` / `post` print `set-cookie` attributes, and the guide says they replace a running
  server for checks. A `post` is a no-JS form post.
- **HZ015 on `effects`** gives the list to paste, in authoring form.
- **`hozu post` is easier to use:**
  - a button can follow `&` in `--next` (`'POST / id=n1&@Pin'`);
  - `--select` takes a comma list;
  - a post to a page that redirects (to sign-in) says so.

### Contracts, busy states, endpoints (ADR 0037)
- **Contracts for decisions only.** A transition with a guard, `navigate` or a `fn` value needs a contract (HZ016).
  - `hozu.lock.json` records every transition readably, e.g. `idle --Draft--> idle · draft := event.text`.
  - HZ018 shows `was: … now: …`, and `--update-lock` accepts copy-only changes.
  - Scaffolds write contracts only where required.
- **Busy states by rule.** A state with `invoke` drops unhandled events, so `ignore` there is HZ014. `done` / `failed`
  take a state name, a transition, or a guarded list.
- **Clearer view errors.** `Invalid view child` says what it got, and `ui.query`'s `pending` is optional.
- **`serve.ts` is checked.** HZ045 warns when the widget bundle or the session store is missing.
- **`hozu add widget <feature> <Name>`** writes the declaration, the client module, the bundle and the dependency.
- **Declared endpoints.**
  - `endpoint({ method, path, input, output })` is implemented in resolvers. It answers JSON, or a `Response` with
    `output: 'response'`, and can call `setSession`.
  - HZ046 checks paths, with patches.
  - `examples/notes` serves `GET /api/notes`.

### Migrating from 0.4
- **Run apps with the transform:**
  - add `@hozu/transform` to the dependencies;
  - start with `node --import @hozu/transform/register serve.ts`;
  - add `hozuTransform()` to Vitest.
- **Delete `ignore` in states with `invoke`.** The HZ014 patch does it.
- **Old forms still work.** Explicit `op.*` / `ui.if` code needs no change, and contracts on copy-only transitions
  stay valid as examples.
- **Refresh the lock:** run `hozu check --update-lock` once for the readable summaries.
- **Refresh the skill:** run `hozu skill`.
- **`hozu validate --json` coverage:** `covered` / `total` now count deciding transitions, and `transitions` counts
  all of them.

## 0.4.2 — no JS download on pages that do not run it, no silent widgets

- **The client runtime is preloaded only where an island renders (ADR 0036).**
  - Some islands can be left out of a page: those inside `ui.each`, `ui.if`, `when` or a query branch.
  - A route whose islands are all of this kind no longer preloads `client.js` in `<head>`. The preload is written
    right before the first island that renders, and not at all on a page that renders none.
  - Before, such pages downloaded about 8 KiB they never ran.
  - Pages with an island outside such branches are unchanged. This is true of every example app.
- **`hozu plan`** shows `js: 2 islands (always)` or `js: 1 island (only when rendered)`. In `--json`, `js` is
  `'always' | 'conditional' | false`; it was a boolean.
- **Static export** writes `/_hozu/client.js` only when an exported page runs it.
- **A missing widget bundle is an error.** If views use `ui.use` but `createServer`, `createHandler` or `exportStatic`
  got no `widgets`, startup throws and names the widgets and the fix (`widgets: await bundleWidgets(build)`).
  - Before, the scaffolded `serve.ts` rendered empty hosts that never mounted, with no error anywhere.
  - A bundle that lacks a widget (a failed HZ029 build) is an error too.
  - The client logs any widget without client code.
  - `testApp` and `hozu get` do not run client code, so they need no bundle.
- **The Widgets guide** says bundling is a separate step, and that a library's CSS goes in `app.css`.

## 0.4.1 — accessibility and widget docs

- **`role` on SVG elements.** `ui.svg({ role: 'img', 'aria-label': '…' }, …)` type-checks and validates. Before, it
  was TS2353 and HZ014.
- **`ui.noscript`,** for content shown only without JavaScript.
- **Widgets in the guide.** `reference.md` explains that there is no `widget` export. It shows the whole path:
  `ui.widget` in the feature's `declarations`, `ui.use`, a client module with `implement<typeof W>` from
  `@hozu/core/widget`, and `bundleWidgets` (`hozu build` does it for you).

## 0.4.0 — what the official site found

Gaps found while building [hozu.org](https://hozu.org) with Hozu (ADR 0032).
- **No flash between pages.** The stylesheet turns on cross-document view transitions, so links between pages
  without islands cross-fade instead of flashing, with no JS (Chrome/Edge 126+, Safari 18.2+; other browsers are
  unchanged). With `prefers-reduced-motion` the pages swap without animation. Turn them off with
  `@view-transition { navigation: none; }` in your stylesheet.
- **Static output contains every file its pages link to.** `exportStatic` and `hozu build` now write
  `/manifest.webmanifest`, and `/sw.js` with `/_hozu/sw-register.js` when `site.offline` is set. Before, pages linked
  them but only the server generated them.
- **`head.image` accepts `ui.asset(...)`,** for a share image on a static host. It is linked by absolute URL and
  copied with the other assets.

## 0.3.0 — less reading, less rewriting

- **`hozu map`:** a compact outline of the app with `file:line` for every entry. It covers routes and their pages,
  queries and mutations with their errors and tags, events and their fields, and the machine's states with their
  transitions, `invoke`, `ignore` and `after`, views and contracts. The example apps map in about 1.2 KB. `--json`
  follows `map.schema.json`.
- **`hozu add feature <name> --with detail,toggle,filter,remove`:** composable parts on top of the list and add
  form:
  - `detail`: a detail page with a 404, and its route, head and `entries`;
  - `toggle`: a done field and a per-item button that works without JS;
  - `filter`: in-page All / Open / Done buttons and an empty state;
  - `remove`: a per-item delete.

  Each of the 16 combinations checks clean in a fresh app.
- **Recipes in `changing.md`,** verified by applying them to a scaffolded app in a test:
  - an enum field chosen in the add form;
  - an action button that works on many items;
  - a field shown on the detail page;
  - adding a detail page.

  The change loop starts with `hozu map`.
- **`hozu get` / `hozu post` show more without a server:**
  - `--select <selector>` prints matching elements with their attributes. The selectors are `tag`, `#id`,
    `[attr]`, `[attr=value]` and `tag[attr=value]`, e.g. `button[aria-pressed=true]`.
  - `--forms` lists each form's action, fields with their defaults, and submit buttons.
- **`--with auth`:** sign-in and sign-out (`features/account`), a signed `HttpOnly` session cookie in `serve.ts`,
  per-user queries and resolvers, and a redirect to `/login` when signed out. A second feature with `auth` reuses the
  account. `hozu get` / `hozu post` keep a real session cookie across steps, so sign-in flows can be tried without a
  server.
- **`hozu add feature` prints what to edit:** the generated declarations by kind, and every user-facing text with its
  `file:line`. The guides say not to print the generated files.

## 0.2.0 — a cheaper loop for agents

### Commands
- **`hozu check`:** type-checks the app with its own TypeScript and runs every rule and contract. One command and
  one summary line; `--json` follows `check.schema.json`.
- **`hozu get <path>...`:** requests pages in-process, with no server. It prints the status, title, every
  `role="alert"` text and the visible text (capped at 1,500 characters).
- **`hozu post <path> --field name=value [--next <step>]...`:** fills the page's form like a browser, posts it,
  follows the redirect, then runs the next steps in the same process.
  - A step is `'/path'`, `'GET /path'`, `'POST /path a=1&b=2'` or `'POST /path @Button label'`.
  - `--button <label>` picks a form by its submit button, for action forms without fields.
- **`hozu add feature <name> [--page <path>]`:** scaffolds a working feature and wires it into `hozu.config.ts`,
  `server.ts` and, with `--page`, `routes.ts`:
  - a list query and an add mutation;
  - a machine with a busy state;
  - a no-JS form with field errors;
  - the contracts;
  - in-memory resolvers.

### Other changes
- **The skill and the app guide teach this loop:** `add` → edit → `check` → `get` / `post`. `patterns.md` points
  at the part of the example each pattern uses.
- **`create-hozu` apps** also depend on `@hozu/testing`, which `get` / `post` use. Their `check` script is
  `hozu check`.
- **`<html data-hozu-ready>`** is set once the page has hydrated, for browser tests.

## 0.1.0 — first public release

All packages are published under `@hozu/*`, plus [`create-hozu`](https://www.npmjs.com/package/create-hozu).
The framework was developed under the working name Tenon (see `docs/adr` 0001–0025).

### Authoring
- **Declarations:**
  - features, one state machine per feature, typed events, queries, mutations, tags, `fn`s, views, widgets and
    messages;
  - `feature({ id, intent, declarations })` sorts declarations by kind (ADR 0022).
- **Contracts:** given / when / expect for every transition. `expect.changes` states only what changes. A behaviour
  lock catches drift (HZ016, HZ018).
- **Views:** typed element trees with every HTML/SVG element, typed attributes and DOM events, `toggle` and `vars`,
  Tailwind classes checked against the generated CSS, `ui.if`, `ui.each`, `ui.query` and motion.
- **Routes:**
  - typed `params` and `search`, with the `:x?`, `:x+` and `:x*` modifiers;
  - `ui.link` is the only form of an internal URL;
  - soft navigation keeps UI alive across links.
- **Forms:** work without JavaScript. Field errors come from the `Invalid` error, and there is a pattern for
  optimistic items.
- **Other features:**
  - i18n with typed messages and `Intl` formatting;
  - typed `env`;
  - sessions, CSP and cross-site POST checks;
  - Markdown collections;
  - image `srcset` and share images;
  - preview mode, PWA and an offline page;
  - `@hozu/testing`.

### Rendering
- **Render plans are derived per node:** static, ISR, SWR, streamed or client. User-scoped data cannot reach a
  cacheable region.
- **Server HTML comes from generated JavaScript** (ADR 0024). `hozu build` writes it for edge runtimes.
- **The client runtime** hydrates only machine-bound islands. It is 7.5 KB gzipped, with a compact payload and
  modulepreload (ADR 0023).

### Tools
- `hozu validate | inspect | graph | explain | impact | plan | build | skill`, all with `--json` and JSON Schemas.
- 43 diagnostic codes, each with a location, a cause and a fix.
- `create-hozu --agent claude|agents|both`: writes `CLAUDE.md` or `AGENTS.md`, plus the versioned authoring skill
  with a verified example.

### Requirements
- Node 22.18 or newer.
