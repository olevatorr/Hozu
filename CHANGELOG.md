# Changelog

## 0.21.0 — Continuity: a page that never flashes (ADR 0067)

`hozu migrate` raises the packages; run `hozu build` again before deploying (component fingerprints changed). One
behaviour to check: a transition's `navigate`, `refresh` and `copy` now read the context after its `assign` (below);
`hozu check` shows a `navigate` that changes through its contract. Hozu knows the whole page before it runs, so it
keeps the page calm with no code from you.

### A calm page
- **A query region settles instead of being replaced.** When its input changes (a filter, one more item), the rows
  on screen stay, marked `aria-busy`, and update by key; only the new row is inserted. `pending` shows only before the
  first answer. (Adding a symbol to the watchlist rebuilt 14 elements and flashed `pending`; it now inserts one row.)
- **What an update adds fades in** (160 ms, rising 4 px): a region that was empty, rows added to
  a list. A swap does not fade. Nothing animates on the first render or with reduced motion; a `motion` name still
  chooses your own.
- **A request that fails no longer leaves the page waiting:** a query read that cannot reach the server (offline, a
  502 page) shows the `Unexpected` branch instead of the old rows, and a mutation that cannot reach it goes to
  `failed.Unexpected` instead of staying in its busy state.
- **Views two pages share keep still across a page change:** their root gets a derived `view-transition-name`, so a
  header or a side panel stays while the rest cross-fades.
- **A machine the next page shows too keeps its state** across the page change (the tab's `sessionStorage`, for the
  same visitor, under half an hour, calm states only, not on a reload; fields the address seeds come from the
  address). The page hydrates the server's view, then enters the kept state; a prerendered page does so when shown.
  State that belongs to one item (a draft on `/posts/:id`) should be seeded from the address. In an app with a
  session, cacheable pages keep nothing (they cannot know who is visiting). The code loads as a small chunk next to
  hydration; the initial client is 8 935 B.
- **`hozu browse` proves it:** a step that rebuilds elements unchanged reports a flash (`N elements rebuilt unchanged
  (a flash)`), and layout that moves without input reports `layout shift X` (as CLS counts it). The examples were
  fixed where it found flashes: controls are disabled while busy instead of hidden.

### Shorter forms for common UI
- **`is([...])` works for structure:** `is(['paused']) ? resume : pause`, `!is(['idle']) && saving`; HZ005 reads the
  states each branch can show in. (A `!is(…)` was evaluated as JavaScript before.)
- **`ui.set(ctx.field, value)`** in a view's `on`: a control that only sets a context field needs no event. The build
  adds the event and a shared `on` that stays, the IR of the long form; a native post checks the value against the
  field's schema.
- **`replace: () => ui.link(…)`** on a transition writes the address without loading a page, so a reload or a shared
  link keeps a search (`examples/stations`). A link that copies context fields decides nothing (no contract).
- **Every effect of a transition reads the context after its `assign`** (`navigate`, `refresh`, `copy`, `replace`),
  like the `invoke` input of the state it enters. `navigate` read it from before until 0.20. A `replace` to another
  route is HZ014: that is a `navigate`.

### Fixes and tools
- Component fingerprints hash the recorded render, `ui.each` items included (a bundler cannot change them; a
  constant the render reads does, GitHub issue #1 point 3); the manifest keeps `fn` fingerprints only.
- The runtime makes no random value at module load (Cloudflare Workers refuse one at startup): `httpBus` picks its id
  when it first sends.
- `replace` to a route that no page of the machine shows is HZ014; `aria-busy` is counted per parent and released
  when a busy region goes away.
- `hozu migrate` leaves out the paths it cannot predict before it counts, so a real IR difference is never hidden
  behind 50 fingerprint lines.
- A changed lock entry lists only the fields that changed (`guard was …, now …`) before its `now:` line.
- `hozu browse`: a same-document address change (`replace`) is `in place`, not a page load; `release;` followed by
  another step splits correctly.
- The guide: `fn` for computed attributes (an SVG path), `vars` with arbitrary-value classes for sizes and colours,
  the Chart.js client component in `examples/showcase`, and a Vue / React → Hozu table (`hozu docs views --more`).

## 0.20.2

- **A bundled app with components or `fn`s matches its build manifest** (GitHub issue #1). The IR fingerprinted
  component renders and `fn` bodies from their function text, which a bundler reprints, so
  `createHandler(app, { manifest, render })` refused an `app.ts` bundled with `hozuTransform()`. `hozu build` now
  records those fingerprints in the manifest and a build with a manifest reads them. Run `hozu build` again after
  upgrading, and build and bundle from the same source on every deploy (an edited `fn` body alone no longer fails
  the manifest check).
- **`@hozu/bundle` keeps Node out of edge bundles:** it loads `node:path` and esbuild only when it builds.
- **DevTools: Copy for AI saves the request too.** A pasted request had no file, so the agent could not mark it done
  (`hozu requests done`). Copy for AI now saves `.hozu/requests/NNNN-….md` and adds a last line with the file and the
  `hozu requests done <n>` command; Copy and Save of the same request share one file.

## 0.20.1

- **`hold` works for browser-run mutations too:** `hozu browse --do 'hold watchlist.addSymbol'` keeps a `runs:
  'browser'` (or `'either'`) mutation from running until `release`, so the busy UI of a localStorage app can be read
  and screenshot. `hozu browse` serves the feature's fetch module through a wrapper; the production runtime is
  unchanged.
- **`target: 'previous'` returns to the last state without `invoke`:** A → looking → saving → `previous` comes back to
  A (it went back to `looking` and ran its lookup again). A return from a state entered right after a busy one now
  skips that busy state too, and a state entered only through busy states has nothing to return to (HZ007 for its
  `done` / `failed` / `after` returns; a contract's `given.previous` that invokes is HZ007).
- **`hozu dev` reloads only for files that changed since it started:** it records each file's time at start, so a
  late or repeated file event (common under load) no longer reloads the page.
- **`browse` targets ignore symbols** when no name matches exactly: `click 暫停` finds `❚❚ 暫停` or `⏸️ 暫停` (still one match only).
- **A machine may invoke a query** (the guide said only mutations; the runtime always ran both): "ask the server,
  then save in the browser" is `invoke(serverQuery)` → `invoke(browserMutation)` with `done: 'previous'`, as the
  recipes topic shows. An invoked browser-run query no longer reads the page's queries again by its tags.

## 0.20.0 — Simple requests stay simple (ADR 0064)

No source change is needed (`hozu migrate` raises the packages). An `accept` entry for HZ036 on a form that starts a
`runs: 'browser'` mutation is now stale (HZ087): delete it. A `machine({ on })` entry without `target` now stays
without entering its state again: run `hozu check --update-lock` if HZ057 lists such entries (`--> stays`).

- **`refresh` on a transition** reads the page's queries with those tags again, with no write:
  `on(RefreshNow, { refresh: () => [quotesTag()] })`, or every 30 s while a `live` state lasts
  (`after: [{ ms: 30_000, target: 'live', refresh: … }]`; Pause is another state). It replaces the no-op mutation
  whose only job was `invalidates`. Contracts expect `{ refresh: [quotesTag()] }`. `freshness: { poll }` stays for data
  that is always kept fresh.
- **An `on` without `target` stays where it is:** its state's timers keep running and an `invoke` keeps going, as in
  XState v5 or plain `setInterval` code. A Copy click no longer restarts a refresh timer, typing no longer keeps a
  toast open, and a busy state can take an event without restarting. Naming the state enters it again (a debounce, a
  repeating timer).
- **`copy` on a transition** writes text to the clipboard: `on(CopyLink, { copy: (e) => e.url })`.
- **`is([...])` in a render** follows the machine state as a value: `disabled: is(['saving'])`.
- **Warnings about real problems only.** A form that starts a browser-run mutation no longer warns (HZ036); HZ036
  now says what actually goes wrong (a submit before the page has loaded is lost). HZ005 suggests handling the event
  first (`machine({ on })`), since `ignore` drops the click.
- **`hozu browse` runs with JavaScript by default**; `--js off` / `--js both` are for a page that must also work without
  it. The skill's verify line, `hozu map` and the docs follow.
- **The guide** shows native dialogs, popovers and menus (`command` / `commandfor`, `popover`, `<details>`), a toast
  that keeps the page usable, refresh controls, dark mode, and asks where data lives only when it could be shared or
  follow a user across devices.
- **P7** (initial client JavaScript) budget rises to 9 KiB.
- `hozu dev` compares file times with the wall clock, so files saved just before it started no longer reload the
  page once it runs.

## 0.19.0 — What an agent building a dashboard found (ADR 0063)

No source change is needed (`hozu migrate` raises the packages).

- **The guide no longer teaches keeping app data in server memory.** Every example kept its data in a module-level
  array and nothing said it was a stand-in, so an agent stored each visitor's watchlist in one list on the server,
  shared by everyone, without asking. `SKILL.md` now says where data lives is the person's call (ask when the request
  does not say); `hozu docs data` opens with "whose data is it?" (the visitor's own → the browser, a user's →
  session + database, everyone's → a database); stand-ins are named `demo…` in the examples and the scaffold; a new
  recipe, "A personal list without sign-in"; and `examples/watchlist` keeps the list in `localStorage` with quotes
  from the server.
- **`freshness: { poll: seconds }`** reads a query again on a timer while a page shows it (5 s to a day; any `scope`
  and `runs`). It skips hidden pages and in-flight effects; public data is cached on the server for half the
  interval, user data never.
- **`target: 'previous'`** (also `done: 'previous'`) returns to the state the machine came from, so a busy state
  entered from two modes needs no copy per mode. Contracts take `given: { state, previous }`; HZ016 suggests it, and
  a `done`, `failed` or `after` return from a state nothing enters from another state is HZ007 (the machine would
  stay there).
- **A field alone is a guard:** `guard: () => ctx.auto`.
- **Removing a guard is reviewed by the lock alone.** A transition that stops deciding no longer asks for a covering
  contract (HZ018); HZ057 says to accept it and delete the contracts HZ058 names.
- **`hozu browse` says what each step did:** the page reloaded, navigated, or changed in place (`--full` adds how many
  elements were redrawn). `hold <feature>.<effect>` keeps an effect's answer until `release`, to read and screenshot
  the pending state. Click and fill targets match the accessible name (`aria-hidden` glyphs left out).
- **SVG shapes** (`path`, `circle`, `rect`, `line`, `stop`, …) take their children argument as optional.
- **`@hozu/css` moves `@import url(…)` rules to the top** of the compiled stylesheet; the content topic recommends
  local fonts and shows a remote one with its CSP sources.
- **`ui.format.*` is listed in the views topic.**
- **`@hozu/cli` no longer depends on `create-hozu`**, so a release is installable as soon as the `@hozu/*` packages
  are on npm.

## 0.18.2

- **`hozu dev` no longer reloads because the app wrote a file.** It reloaded the page, and restarted the app, for
  any `.ts`, `.css` or `.json` change in the project, so a resolver that keeps data in `data/*.json` reloaded the page
  after every mutation (instead of refreshing the invalidated queries in place) and, by restarting, signed everyone
  out of the default in-memory sessions. It now reloads only for files the app loaded or the browser bundle read
  (client components, `fetch.ts`), stylesheets (still swapped in place), env files (now watched too),
  `package.json` and `tsconfig.json`. The page logs which files changed
  (`[hozu dev] reloaded: lib.ts changed`). ADR 0062.
- **Releases run in GitHub Actions** (ADR 0061): a version tag builds, tests and packs, then publishes after the
  owner approves, with npm Trusted Publishing and provenance; `create-hozu` goes out only once every `@hozu/*` package
  is on npm, and a fresh install is checked.
- Two tests that passed on macOS only now pass on Linux too.

## 0.18.1

- **DevTools on a client component says why you cannot select inside it.** A client component draws its inside in
  the browser (its `client` module), so DevTools selects it as one part. The inspector now says which module draws it
  ("Drawn in the browser by features/site/editor.client.ts …"), and no longer offers Inside / Child, which did
  nothing there. `hozu why` on such a node gives the module as `component.client`.

## 0.18.0 — What a backend engineer's app found (ADR 0060)

No source change is needed (`hozu migrate` raises the packages).

- **Renew a session while the app only reads: `app({ refreshSession })`.** When the session holds a token that
  expires, `refreshSession: async (session, { env }) => …` runs once per request, before any resolver reads the
  session. Return the new value (it replaces the old one on the server under the same id, so the cookie stays),
  `null` to sign out, or `undefined` to keep it. Within one process, requests of one session share one call (and its
  result for ten seconds), a sign-out while it runs wins, a throw keeps the session and reaches `onError`, and the
  value is checked against the session schema. Its types come from
  `resolvers(project, …)`. `SessionStore` gains an optional `update(request, value)`, which `memorySessions` and
  `kvSessions` have. Queries still only read.
- **DevTools in your language.** `npx hozu devtools messages > devtools.zh-TW.json` prints every DevTools string to
  translate; `hozu dev --devtools-messages <file>`, or `HOZU_DEVTOOLS_MESSAGES=<file>` in your shell for every
  project, shows it. A missing string stays English, `hozu dev` says how many are missing, and `--check <file>`
  lists missing, stale and wrongly placed `{placeholders}`. The request Markdown and the CLI stay English. A
  complete Traditional Chinese file is in `examples/studio/devtools.zh-TW.json`.
- **A 404 or 410 page is titled with the site name**, not `null · <site>`: a failed head query no longer evaluates
  the head fields.
- **HZ014 for a condition inside `navigate`** now says so and gives the fix: one guarded transition per link.
- **`hozu browse --viewport 390x844`** opens at that size (a phone below 768 px wide), for `--screenshot` and layout
  checks; `--do 'screenshot …'` points at `--screenshot <file>`.

## 0.17.2

Deploying, and what trial 0024's re-run found (ADR 0059). No app changes how it is written; `hozu migrate` raises the
packages.

- **`npx hozu export`** writes every page for a static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel) to
  `dist/`, with `.nojekyll`, and exits 1 naming each page and server effect a static host cannot answer. New apps
  include `@hozu/adapter-static`; older ones `npm install @hozu/adapter-static`.
- **Cloudflare Workers:** a bundle made with `hozuTransform()` now starts (it threw `Invalid URL string`: a Worker
  has no `import.meta.url`, which core and every `hozu.config.ts` use). The plugin gives each app file its own URL;
  no `define` is needed.
- **`kvSessions(kv, { secret })`** keeps sessions in a shared key-value store, so several instances, or a Worker
  with a KV binding, agree on who is signed in. Same contract as `memorySessions`: an opaque signed id in the
  cookie, the value on the server, deleted on sign-out. On Workers: `createHandler(app, { …, session:
  kvSessions(env.SESSIONS, { secret: env.SESSION_SECRET }) })`.
- **`hozu build` writes `server/render.d.ts`**, so an edge entry that imports the render module passes `tsc` and
  `hozu check`.
- **A static export under `basePath`** writes `sitemap.xml` and `404.html` under the base, where `robots.txt` points
  (a GitHub project site uploads `dist/<repo>`).
- **`hozu migrate` 0.14 → 0.15** renames an error the app named `Forbidden` (the framework's access error since 0.15)
  to `NotAllowed`, and still proves the IR unchanged.
- **DevTools:** a request counts a message used by the page head or an attribute as another place, so it says
  "shared by 2 places; give this one its own message" instead of sending the agent to change the tab title too.
- **Guide:** the deploy topic covers `hozu export`, Docker, Workers and shared sessions; the testing topic shows how
  to post a stale form with `hozu browse` (`remember … @action`, then `post $name`).
- The site's Deploying page has tested recipes: GitHub Pages, Cloudflare Pages / Netlify / Vercel, Docker and
  Cloudflare Workers with KV sessions.

## 0.17.1

- **A visitor's cached client no longer breaks the page after a deploy.** `/_hozu/client.js` was referenced under a
  fixed URL while its chunks carry content hashes, so a browser that kept the previous `client.js` (Safari keeps it
  past the host's `max-age`) asked for a chunk the new deploy no longer had (404, `Importing a module script
  failed`) and no island hydrated: on hozu.org the home page's AI CHANGE did nothing in Safari. Pages now reference
  `/_hozu/client.js?v=<content hash>`, and a client whose chunk fails to load reloads the page once.
- Client budget P7: 8 011 B of 8 192 (the reload guard).
- `client.js` under its current `?v=` is served `immutable`, its chunks too; a bare `/_hozu/client.js` is `no-cache`.
- **DevTools:** the Design panel reads a value from the element's own classes first, so a part selected under the
  pointer no longer shows its `hover:` colour; Assets tiles are at least 320 px wide (phone layouts fit); the shortcut
  tip hides while a panel is open, instead of covering it.
- The site's header shows the menu button below 1024 px, keeps the links on one line above it, and the menu opens
  with a short slide (none under reduced motion).

## 0.17.0

DevTools for Figma hands (ADR 0058). Everything here is DevTools, loaded only under `hozu dev`: production pages,
the client budget and the authoring surface do not change, so 0.16 apps upgrade without a source change
(`hozu migrate` raises the packages).

### Keys and measuring, as in Figma
- **`Shift+Enter` selects the surrounding part, `Enter` the first part inside, `Tab` / `Shift+Tab` the next or
  previous part beside it.** ↑ / ↓ still work. **Alt+click no longer selects the parent**: Alt measures now.
- **Hold Alt to measure:** with a part selected, red lines show the distance in px to the part under the pointer
  (the gap between two parts, or the four insets when one holds the other); with nothing selected, the part under the
  pointer is measured against the part around it.
- **The selection shows its size**, `W × H` in CSS px.

### The Design panel
- **Look is now Design, in Figma's order:** Frame (W, H, corner radius), Auto layout (gap, horizontal and vertical
  padding), Layer (opacity), Fill, Stroke (weight, colour), Effects (drop shadow), Text (size, weight, colour).
- **New properties:** width, height, gap, opacity, border width, border colour and shadow, each turned into the theme
  utility the agent should write (`w-80`, `w-full`, `gap-4`, `opacity-50`, `border-2`, `border-red`, `shadow-lg`),
  with the nearest theme step when a value is off the scale.
- **Builder shows design tokens first** (`2xl · 24px`, `red · #fb3a0e`); Developer keeps classes first.

### Assets: every component on one page
- **A new dock button, Assets**, opens a full-screen board: every component of the app, each variant on its own and
  the named previews, rendered live from the IR with your stylesheet (props filled from the schema), so there is no
  showcase page to write by hand and no Storybook. Search, a detail view (variants, properties, slots, the file and
  line), **Where used** with **Show the instances** (frames every use on the page, or opens a page that has one),
  and **Change the main component**, which adds a request for every use.
- **Styles** shows the design tokens: colours, text sizes, corner radius, shadows and the spacing unit.
- DevTools keeps its own scrolling and pointer: libraries that hijack the wheel or lock the page (Lenis, modal
  scroll locks) no longer scroll the page under a panel.

### `previews.ts`: screens for people
- **`project({ previews: new URL('./previews.ts', import.meta.url) })`** names named component states
  (`p.component(ui.Button, 'Long label', { children: '…' })`) and page screens whose queries answer with the data
  given (`p.page(home, 'No notes', [p.data(listNotes, [])])`, `p.fail(listNotes, 'Unexpected')`), from
  `@hozu/core/preview`.
- **It never ships:** only `hozu dev` and `hozu check` load it; `hozu build`, a production server and
  an edge bundle never import it, and a production server ignores the DevTools cookie that picks a screen.
- **Layers → Previews** and **Assets → Screens** open a page screen under `hozu dev` (uncached, `noindex`); the dock
  shows it until you exit.
- **HZ092** keeps previews honest: data off its query's output schema, an error the query does not declare, a route
  without a page, or a component use that does not build, each at its `file:line`; a previews module that is
  missing, throws or exports something else is HZ014.
- **Agents leave it alone:** `hozu map` does not list it, and the skill says to read it only when asked or when
  HZ092 names a line. `examples/notes`, `examples/bookmarks` (the skill example) and the site have one.

### Figma's words
- Scope: **This instance only** / **Main component · every Button (6 places)**.
- Agent notes and saved requests: **Resolve** (was Done). The Workbench is **Frame**.
- The request Markdown your agent reads and the CLI (`hozu requests done`) are unchanged.

### Fixes
- **`feature({ styles: new URL(…) })` is HZ014** with the list form as the fix; before, `hozu check` crashed with
  `flatMap is not a function`.
- **Stopping `hozu dev` stops its app:** `kill <pid>` (the line `hozu dev` prints), Ctrl+C or a closed terminal left
  the app process on the second port, so the next `hozu dev` said the port was in use. The app now exits with
  `hozu dev`, also when `hozu dev` is killed outright.

## 0.16.0 — Ship less, measure fairly, learn faster (ADR 0057)

0.16 closes a security hole the 0.15 dogfood found, makes pages smaller on the wire and faster to render, and fixes
what four apps built from scratch with 0.15 ran into. No breaking change: upgrade the `@hozu/*` packages.

**Upgrade now if a mutation uses `access: { owner: { load, … } }`** (see Security below).

### Security: an owner rule's load fails closed
**Upgrade if a mutation uses `access: { owner: { load, … } }`.** In 0.15.0, when the `load` query failed with a
declared error (for example `NotFound`), the mutation's resolver still ran, so the owner check could be bypassed
by naming a row the load refuses. Found by the 0.15 dogfood.
- **A failing `load` now answers `Forbidden`, whatever the reason, and the resolver does not run.** That includes a
  declared `NotFound` and an unexpected error in the load: a mutation guarded by an owner rule answers 403 for a
  row it cannot see, never 404 or 500, so a caller cannot tell a missing row from someone else's.
- **An owner both sides lack never matches:** a missing row field and a missing session field are no longer equal.

### Share cards and the sitemap
- **The share card is derived from the image:**
  - `og:image:width` and `og:image:height` are read from the file;
  - `og:image:alt` is the page title;
  - `twitter:card` is `summary_large_image` from 600 px wide, `summary` below. X used to show the small card.
- **`entries.lastmod: (item) => item.updatedAt`** adds `<lastmod>` to the sitemap. It takes an ISO date, and an
  invalid one is left out.
- **`site.url: { env: 'SITE_URL' }`** reads the origin at startup, in the handler and the static export. The
  variable must be declared (HZ085); a missing or non-origin value stops the start.
- **Every package lists `funding`** (`npm fund`).

### Fixes (found by the 0.15 dogfood)
- **A form holding a `ui.query` posts without JavaScript again:** the streaming render path left out its `method`
  and `action`, so the form fell back to GET.
- **A refused native post redirects like the page:** signed out, a forged post to a page whose head maps
  `Forbidden` to a route answered 303 without a `Location`; it now redirects there.
- **`invoke` takes what the mutation's schema takes in:** a field declared `z.coerce.number()` accepts the form's
  text, as the forms guide says (before, `invoke` wanted the parsed `number`). Resolvers and `fetch.ts`
  implementations still receive the parsed input.
- **`hozu show` and `hozu why` take `views.ts:42`** (or `features/notes/views.ts:42:9`): the outermost view node
  written there, so an agent needs no dev server to find an id; a line that two files share is refused with both
  paths. `hozu show … --in "<text>"` frames one row of a list. Listing the notes marks one `STALE` when its id now
  names another part, and still lists them while the project does not load. SKILL.md's change loop ends with it.
- **`hozu serve` and `hozu dev` print how to stop them** (`stop: kill <pid>`), so an agent stops its own server
  instead of every Hozu server on the machine.
- **A head field Hozu does not know is HZ014:** `head.render` returning `twitter` or `jsonLd` was silently dropped.
  A render that returns the head query's value as a whole is still recorded.
- **An endpoint at `/sitemap.xml`, `/robots.txt` or (with a `site`) `/manifest.webmanifest` is HZ046:** it hid the
  derived file.
  Shape it with `entries` (now with `lastmod`), `noindex` and `site` instead.
- **`hozu get --select script` reads the head's scripts**, raw, so the JSON-LD can be checked without a server.
- **Pages without machines get a lock too:** an app whose head maps errors, or that has endpoints, redirects or
  access, reports the lock missing, and `--update-lock` writes it. Before, those were never locked.
- **HZ054 knows exclusive branches:** two controls of one name in different branches of a query or a condition
  (a `<select>` when ready, a hidden input when it failed) never post together, so they are one value.
- **HZ057 on `/pages` names access** among what the pages section locks.
- **Line numbers stay right after a multi-line `?:`, `&&` or `??`:** the transform moved the newlines between the
  operands to the end, so every node after one reported an earlier line in `hozu why`, `hozu show`, DevTools and
  diagnostics (the dogfood saw a list row reported on its `<tbody>`'s line).
- **`hozu browse` takes the forms agents write:** `in "<text>"` before or after a fill's value, several steps in one
  `--do` joined with `;` (outside balanced quotes, before a verb and a space), and a missing target prints `Did you mean "<closest label>"?`. In trial 0024, a quarter
  of the agents' browse runs failed on such a guess and re-ran a whole chain.
- **`hozu browse` treats a page's 401, 403, 404 or 410 as the step's answer:** a step that loads such a page
  shows `→ /notes/n1 (403)` and is not an error, so an access check exits 0. The start page still must load, and
  such an answer inside an iframe stays an error.
- **`hozu browse` ignores the view-transition abort** a browser reports when a step posts to a JSON endpoint.
- **`--with auth,detail`:** the detail page maps `Forbidden` to the sign-in page and lists no user data in the
  sitemap.
- **The guide answers what the dogfood asked:** `SESSION_SECRET` length, how a refused page renders, the order of
  input, access and resolver checks, `exports` / `imports`, what endpoints cannot do yet, why a link resets context,
  per-language collections and images named in front matter.
- **`exports` in the old record form** (`exports: { queries: [...] }`) is HZ014 with the list form, not a crash;
  HZ006's fix shows both edits in source form (`imports: [owner]`, `exports: [name]`), each with its feature.
- **The deploy guide no longer says `public/` is served:** files a page shows are `ui.asset`, files named in data
  are served by a GET endpoint with `output: 'response'`.

### Compression in adapter-node
- **Answers are compressed as they stream** (gzip, or brotli when only that is accepted), flushed whenever the
  stream waits, so the head still arrives first and a streamed text answer is never held back.
- **Framework files are compressed once:** `hozu build` writes `.br` and `.gz` next to each file of `dist/public`
  over 1 KB; an immutable `/_hozu/` file without them is compressed once and kept. Nothing else is kept: an answer
  that is private or sets a cookie is compressed for its own request only. Every answer that could be compressed
  carries `Vary: Accept-Encoding`, compressed or not, so a CDN keeps both.
- **Not compressed:** live streams, HEAD, 204 / 206 / 304, `Cache-Control: no-transform`, and already-compressed
  types. The web-standard handler (edge) leaves compression to the platform.
- **A body that fails mid-stream** (an endpoint's own `Response`) cuts the connection; before, the rejected send
  could stop the Node process.

### Faster server rendering
- **SSR is back at the 0.9 level: 47.3 k → 55.0 k renders/s** on the frameworks bench. 0.11 and 0.12 each added a walk
  of every island node on every render (the browser-run queries the page reads, the routes it links to); each
  answer is now kept per IR object.

### Less JavaScript on every page
- **The initial client is 7 884 B gzipped, down from 8 123 B:** a client component use and a keyed list's move
  animation now load only on the pages that have one.

## 0.15.0 — Say who may read and change what, test it as two visitors, and the 0.14 dogfood fixes (ADR 0056)

In 0.14, nothing in an app said who may run a query or a mutation: the rule lived in each resolver, so a missing check
was invisible to `hozu check`. 0.15 makes it a declaration, like `runs`. The tools can now test it as two visitors
in one command. Four apps built with 0.14 found the bugs fixed below, and a performance regression from 0.12 is
found and fixed.

**Upgrade:** `npx -p @hozu/cli@latest hozu migrate`, install, then `npx hozu migrate` again. The step adds
`access: 'anyone'` (the 0.14 behaviour, so the IR does not change) to every server-run `scope: 'user'` query and
every server-run mutation. HZ090 then lists each user query to tighten. Run `hozu check --update-lock` to record
access in the lock.

### Breaking
- **`access` is required** on every `runs: 'server'` `scope: 'user'` query and every `runs: 'server'` mutation. A
  missing `access` is a type error, and HZ088 in untyped code.
- **`Forbidden` is a reserved error name**, like `Invalid`.
- **`hozu impact`, `explain` and `locate` are removed:** `hozu why` answers each (deprecated in 0.14).
- **`hozu serve` (`npm start`) runs as production** unless `NODE_ENV` is set: a session app without
  `SESSION_SECRET` now refuses to start, as it would in production.

### Declared access
- `access: 'signedIn'`: any signed-in visitor.
- `access: { owner: { row: (n) => n.owner, session: (s) => s.user } }`: the framework checks the output.
  - One row that is not the visitor's is `Forbidden`.
  - A list holding such rows is HZ091, because the resolver read too much. It is an error in development; in
    production the rows are dropped and logged once per query.
- On a mutation, `{ owner: { load: getNote, input: (i) => ({ id: i.id }), row, session } }` reads the row and
  checks it before the resolver runs.
- `access: { allow: ({ session, input }) => session.role === 'admin' }`.
- `access: 'anyone'`: on user data it is HZ090 (a warning, which can be accepted with a reason).
- The callbacks are lowered like guards, so the IR holds paths. There are no new exports.
- **Refused** is the framework error `Forbidden`, raised before the resolver runs. It is optional in `failed`.
  - A page whose head query is refused answers 403, unless `head.failed` maps it (`{ Forbidden: login }`).
- **Diagnostics:**
  - HZ088: missing access, or an owner field the row or session does not have.
  - HZ089: access where nothing enforces it (a public or browser-run effect).
  - HZ090: user data that anyone may read.
  - HZ091: a list with rows the visitor does not own.
- **Reviewed and visible:**
  - Access is in `hozu.lock.json`, so changing it is a reviewed change.
  - `hozu why` and `hozu map` show it.
- **Examples:**
  - `examples/notes` declares `'signedIn'`, with a role error mapped to 403.
  - blog and cart declare their user data.
- **Not in 0.15:** generated cross-user checks in `hozu check` (ADR 0056 C5). They need rows and sessions the app
  would have to supply. The runtime check and the `browse` chain below cover it.

### Test it as two visitors
- **`hozu call` on endpoints:**
  - `hozu call api.who --input '{"room":"a"}' --header 'Authorization: Bearer t'` prints the status and the body.
  - A POST endpoint needs `--write`.
- **`hozu browse --header 'Name: value'`:** before the first `--as` it applies to every actor; after an `--as`, to
  that actor only.
- **`remember <name> from url|<selector> [@attr]`:** keeps a value; later steps read it as `$name`, in any actor.
  For example, ada remembers her note's link, then bob opens `$note` and gets 403.
- **`post <path> a=1&b=2`:** a forged native form post as the current actor, without the page.

### Your agent shows you what it changed
- **`hozu show <part> --note "<text>"`:** the part is a DevTools id, an IR pointer or `page:<route>`.
  - Under `hozu dev`, the part gets a numbered red frame on the page, and an **Agent** button appears in the dock.
  - Its panel steps through the notes, scrolling to each part.
  - Clicking a frame's label opens that note in full; hovering shows it too.
  - **Send reply** saves a request, which the agent reads with `hozu requests`. **Done** removes the note.
- **Managing notes:** `hozu show` lists them; `--done <n>` removes one, and `--clear` removes them all.
- **Storage:** notes live in `.hozu/notes.json`, and only `hozu dev` serves them, to this machine. Production has
  nothing of it.
- **The DevTools dock:**
  - it keeps its width at the window's edge (its buttons no longer wrap) and stays 8 px inside;
  - on a narrow window it takes two rows;
  - Select's help is a tip above it (`Click`, `Shift`, `Alt`, `Esc` as keys), not a faint line inside it.
- **The Workbench:** its side columns narrow with the window, and its toolbar takes two rows instead of hiding the
  buttons that do not fit.
- **The Workbench below 1 100 px:** the Layers column folds into a toolbar button and opens over the page.
- **`hozu dev` prints one URL:** the app process's own `… on http://127.0.0.1:<port + 1>` line is gone.
- **`.hozu/` no longer triggers reloads:** changes there (check caches, notes) no longer reload the app under
  `hozu dev`.

### Fixes (found by the 0.14 dogfood)
- **Links:** a `ui.link` attribute built from machine context now updates on the client when the context changes.
- **Endpoints:**
  - an endpoint `fail('E', data)` returns every field of `data` in the response;
  - a disallowed endpoint error status is one HZ046 that lists the allowed statuses.
- **Env:** an env variable set to the empty string is unset, so `optional` and `default` apply.
- **CLI:**
  - `hozu plan` accepts a path (`hozu plan /products/mug`);
  - `hozu check --update-lock` prints the accepted `now:` lines (`--json`: `accepted`);
  - `hozu <command> --help` prints that command's usage.
- **SEO:**
  - `og:locale` carries the likely region (`en` → `en_US`);
  - the sitemap lists `xhtml:link` alternates when `site.locales` is set.
- **`hozu browse --js both`** compares pages by route, so two modes that create different ids are not a
  difference.
- **Scaffold:** the scaffold stores error codes in the machine (`Problem`), not English text.
- **Docs:** views (query branches return one node), pages and i18n (the locale argument of `head.input`), content
  (install, slugs, dates), env (server resolvers read server variables; `internal` applies to `fetch.ts`).

### Performance
- **Cause:**
  - `bench:frameworks` had been broken since 0.8, so a regression went unmeasured: the Hozu row was interactive at
    59–61 ms (4× CPU), against 27.8 ms in benchmark 0001.
  - 33 of the 40 ms of hydration were spent waiting for `import()` of the fn module that 0.12 split out.
- **Fix:** fn modules are now ordered `<script type="module">` tags, placed before the client, that register by URL.
  Hydration reads them synchronously.
- **Result:** hydrate 41 → 6 ms; interactive 62 → 26.5 ms.
- **Guard:** `bench:frameworks` works again, and `pnpm bench` B2 runs the Hozu row with a 50 ms budget.

## 0.14.0 — Easier to learn: one form, one check command, quieter checks (ADR 0053)

The largest cost of building with Hozu is that models do not know it yet: every session learns it from the guide.
0.14 makes less to learn. It removes a hidden default and a duplicate command, and lets a warning be kept on purpose.
Diagnostics are documented from one registry, and `hozu docs` prints about half as much.

**Upgrade:** `npx -p @hozu/cli@latest hozu migrate`, install, then `npx hozu migrate` again. The step:
- adds `runs: 'either'` where `runs` is omitted (the old default, so the IR does not change);
- rewrites `hozu validate` in package.json scripts to `hozu check`;
- removes `hozu graph` scripts.

### Breaking
- **`runs` is required** on every `query` and `mutation`: `'server' | 'browser' | 'either'`. A missing `runs` is a
  type error, and HZ081 in untyped code.
- **`hozu validate` is removed.** `hozu check --no-types` runs the rules and contracts without TypeScript;
  `hozu check --update-lock` accepts a behaviour change.
- **`hozu graph` is removed**, together with `graphOf` / `mermaid` from `@hozu/cli`. Use `hozu why` or
  `hozu inspect`.

### Keep a warning on purpose
- `project({ accept: [{ code: 'HZ036', at: 'lab.SaveDraft', reason: 'drafts live in localStorage' }] })`.
- An accepted warning does not count: `check` prints `0 errors, 0 warnings (1 accepted)` and lists each one with its
  reason.
- **HZ087** (warning): an entry that matches no warning, names an error, or has no reason. Errors cannot be accepted.

### Diagnostics from one registry
- Every code has a summary, a fix and a topic in `@hozu/core`.
  - `pnpm skill` generates the guide's diagnostics topic and the site's table from them.
  - A test fails when a code has none.
- **`hozu docs HZ083`** prints one code: its cause, its fix and the topic to read.
- **Fixes that matched their cause:**
  - HZ084 no longer offers a rename as the way out;
  - HZ021 says to remove one of two implementations, or an implementation of an unknown declaration.

### A shorter guide
- Each topic is the shortest correct form; **`hozu docs <topic> --more`** adds options and edge cases.
- What `hozu docs` prints by default is 27.0 KB over every topic, down from 72.7 KB (37 %). The tested examples are unchanged.
- The `runs` examples in the data and fetch topics now state `runs`.

### `hozu why`
- `hozu why <target>` says what a target is, where it is (`file:line`), what uses it and what it affects.
- The target can be a declaration (`cart.addItem`), a component (`ui.Button`), or a state (`cart.idle`, with its
  transitions and covering contracts). It can also be a view node (a DevTools id or an IR pointer) or a page
  (`page:home`).
- **Deprecated:** `hozu impact`, `explain` and `locate` still answer, with a line on stderr; they are removed in 0.15.
- DevTools requests point at `hozu why`.

### Docs
- The README, the site and trial 0021 say why the comparison is with Nuxt: Nuxt is in the training data, Hozu is
  learned in each session, and everything else is equal.
- ADR 0055 pre-registers trial 0024, which separates the cost of learning Hozu from the cost of its structure. It runs
  after this release.

## 0.13.0 — Test your API while you build, and environment conventions (ADR 0051, 0052)

0.13 turns the DevTools API tab into a drawer for testing while you build, fixes the CSP that blocked 0.11's
browser-run effects from calling other origins, and sets the conventions for the environment. Two trial apps built
from scratch with 0.13 found the bugs fixed below.

**Upgrade:** `npx -p @hozu/cli@latest hozu migrate`, install, then `npx hozu migrate` again. Nothing is rewritten.
- **Browser-run effects:** if `fetch.ts` calls another origin, add `feature({ connect: [...] })`. `hozu check`
  names each missing origin (HZ083).
- **Env files:** to have the CLI read `.env` files, add `env: { files: ['.env', '.env.local'] }` and ignore them
  in git (HZ086).

### DevTools API drawer
- **The drawer:** **API** opens a drawer docked at the bottom, in the overlay and in the Workbench (which had no
  API button).
- **Rows:**
  - each row says **read** or **write** and where it runs (coloured);
  - it shows its freshness and the `file:line` that implements it;
  - input fields are inline, and **JSON** sends any input, also one the schema rejects.
- **Results:**
  - a table or JSON, with the status, the time and where it ran;
  - **Copy as hozu call**;
  - a **History** tab for the session.
- **Mutations** ask in their row. `Invalid` marks the field. The page then re-reads what the mutation invalidated
  in place: the development client offers DevTools the machine's own effect path, and the production client grows
  by 9 B (P7 8,056 B). Browser-run effects go through the page's runner, so they are schema-checked too.
- **Requests it sent:** what a call really sent out, from the server (a development `fetch` trace that never waits
  for a body) and from the browser. It shows headers, bodies, status and time, with **Copy as curl**.
- **Act as** sets the browser's session in development, checked against the session schema.
- **Endpoints** sends a request to each declared endpoint with path parameters, a query or JSON body, and your own
  headers (a bearer token). Queries and mutations still read no request headers: identity is the session.

### Browser-run effects and CSP (ADR 0051)
- **`feature({ connect })`:** `connect: ['https://api.github.com', { env: 'POSTS_API' }]` lists the origins
  `fetch.ts` calls from the browser. Hozu adds them to `connect-src`. Until now, the default `connect-src 'self'`
  blocked `'browser'` and `'either'` calls to other origins on adapter-node and the edge.
- **HZ083** (warning): an absolute URL in fetch.ts, or a public env URL read as `env.NAME`, that `connect` does not
  cover (comments are ignored).
- **HZ081** also covers an entry that is not an origin, and an `{ env }` naming an undeclared variable.

### Environment (ADR 0052)
- **`env.files`** names the env files the CLI reads. A later file wins, and the shell wins over every file. New
  apps list `.env` and `.env.local` and ignore both.
- **`env.internal: { POSTS_API: 'POSTS_API_INTERNAL' }`:** on the server, `'either'` effects call the internal URL
  when it is set, and the public one otherwise. The browser, the payload and CSP only see the public one.
- **`hozu env [--example]`** lists every variable (side, required, default, set now, internal URL) and the ones Hozu
  reserves, and writes `.env.example`.
- **New diagnostics:**
  - **HZ084** (warning): a public variable named like a secret;
  - **HZ085**: an internal mapping to undeclared variables;
  - **HZ086** (warning): a listed env file that git would commit.

### Fixes
- **Required server variables:** `hozu check`, `get`, `call` and `browse` failed on a required server variable
  even when it was set, because they checked the app without its env. `check` no longer needs deployment secrets
  at all.
- **`fetch.ts` apps:** `hozu get`, `hozu browse` and `testApp` failed to start an app with `fetch.ts` (since 0.11).
- **No-JS form posts:** a form whose mutation runs in the browser, posted without JavaScript, answers a page with the
  reason and a link back (it was one line of text).
- **CLI startup:**
  - `hozu` and `create-hozu` say they need Node 22.18, instead of failing on an import;
  - `hozu dev` and `hozu serve` say which port is in use, instead of an `EADDRINUSE` stack.
- **`hozu docs`** prints the guide of the installed Hozu and says when the app's skill copy is older.
- **`hozu browse`** takes quoted targets (`click "Save draft"`).
- **Releases** pack from a clean build (`pnpm pack:release`): earlier tarballs carried the output of deleted sources.
- **Messages:** HZ021 suggests `runs: 'server'` for a server resolver of a non-server effect; HZ045 and
  `hozu build` say to install `@hozu/bundle`.
- **Docs:** `ctx.request` in endpoints, `testApp(app, { env })`, the scope of browser-held data.

### Examples
- **`examples/playground`** has an effect of each `runs`, endpoints with a bearer check, and `env.files` /
  `env.internal`.
- **`examples/stars`** declares its `connect`.

## 0.12.0 — Large apps and many servers, `hozu call` and the DevTools API tab (ADR 0050)

0.12 measured Hozu at 50, 200 and 500 generated features ([benchmark 0003](docs/benchmarks/0003-scale.md)), then
fixed what grew with the app instead of the page, and what a deployment of several instances needs.

**Upgrade:** `npx -p @hozu/cli@latest hozu migrate`, install, then `npx hozu migrate` again. The only rewrite is
`.hozu/` in the app's `.gitignore`, where 0.12 keeps its caches. **One thing to check by hand:** `/_hozu/fns.js` is
gone (see below); a CDN or CSP rule that names it should name `/_hozu/f/*` instead.

### Caches and many instances
- **Bounded caches:**
  - public query results are an LRU of at most 10,000 entries (`app({ dataCache: memoryDataCache({ maxEntries }) })`,
    `DataCache` interface in `@hozu/data`);
  - cached pages are an LRU of at most 5,000 pages (`memoryCache({ maxPages })`), and invalidating a tag touches only
    the pages that carry it;
  - one million distinct keys hold 5.3 MB instead of 702 MB (budget P13);
  - `server.stats()` returns `{ dataEntries, pages, evictions }`.
- **Invalidation bus:**
  - `app({ bus })` tells the other instances which tags a mutation, an endpoint, a native post or
    `server.revalidate` invalidated; they drop the same pages and data and push to their own live clients;
  - `httpBus({ peers, secret })` is built in: a signed `POST /_hozu/invalidate`, zero dependencies;
  - a broker (Redis, NATS, Postgres `LISTEN`) is a few lines against `InvalidationBus`;
  - `app({ staticTtl })` re-reads `'static'` data and pages after that many seconds, a safety net for lost messages
    (off by default).

### Pages no longer grow with the app
- **`fn` modules:**
  - `fns.js` becomes one module per feature, `/_hozu/f/<feature>-<hash>.js` (immutable), holding only the `fn`s the
    browser can call; builtins share a `hozu` module;
  - a page loads only the modules of its machine-bound views;
  - module helpers are emitted once.
- **Routes:** the payload's `routes` lists only what the page's islands link or navigate to.
- **Result, at 500 features:** the same page's payload equals the one at 50 features (it was 71 % larger), and it
  loads 237 B of `fn`s instead of 161.8 KB. `fnModules()` replaces `fnsModule()`.

### A faster `hozu check`
- The type check runs in a child process from the start, in parallel with loading and validating;
  `tsc --incremental` keeps its state in `.hozu/check/`.
- `@hozu/transform` caches transformed sources in `.hozu/transform/` (CLI, `hozu serve`, `hozu dev`;
  `HOZU_TRANSFORM_CACHE=0` turns it off).
- At 500 features, a check after a one-line edit takes 1.91 s instead of 4.61 s (budget P12, `pnpm bench:scale`); at
  50 features 0.41 s instead of 0.83 s.
- `--json` adds `timings: { types, load, validate }`.

### Tools
- **`hozu call <feature>.<effect>`:** runs one query or mutation through the app's own handler, in process.
  - It takes `--input` and `--session`, and a mutation needs `--write`.
  - It prints the value or the declared error, the invalidated tags and the queries they refresh.
- **DevTools API tab:** the queries a page reads and the mutations its machines start, with `runs`, scope,
  freshness, tags and errors. It runs them with an input built from their schema; mutations ask first.
- **`runs` everywhere:** `inspect`, `impact`, `explain` and DevTools Layers show where an effect runs.
- **`hozu migrate`:**
  - `--dry-run` says it *would* save the old IR;
  - a failed check in the verify pass names the type-check state.

## 0.11.0 — Where queries and mutations run, and `hozu migrate` (ADR 0049)

Before 0.11 every query and mutation ran on a Hozu server. A pure front end on a static host could not read
per-request data or mutate, a public API was proxied through the app (two hops, twice the egress), and a token that
lives in the browser had to travel to the server. 0.11 makes where an implementation runs one more declared fact:
the framework derives the rest, and the schemas, declared errors, tags and states stay.

**Upgrade:** run `npx -p @hozu/cli@latest hozu migrate`, install, then `npx hozu migrate` again. The first run adds
`runs: 'server'` to every query and mutation (0.11 defaults to `'either'`) and raises `@hozu/*`; the second
checks that the IR is unchanged and runs `hozu check`. The lock is never written.

### `runs`
- `query({ …, runs })` / `mutation({ …, runs })`: `'server'` (a database, a secret, the session; resolvers as
  before), `'browser'` (the visitor's credentials) or `'either'` (the default: a public API or your own API with
  CORS). `'either'` needs `scope: 'public'`.
- `feature({ fetch: new URL('./fetch.ts', import.meta.url) })` implements the `'browser'` and `'either'` effects:
  `export const x = implement<typeof model.x>(async (input, { fail, signal, env }) => …)` from
  `@hozu/core/fetch`, one export per effect; `env` is the parsed public environment.
- **`'either'`:** server-rendered on first paint (cached per `freshness`), then in-page reads and mutations call the
  API from the browser directly, never through the app's server.
- **`'browser'`:** the server renders the `pending` branch (render-plan mode `browser`) and never runs it:
  `/_hozu/query`, `/_hozu/effect` and native form posts answer 400.
- **In the browser:** a lazy runner chunk (P11, 1.9 KB) loads each feature's fetch bundle once, checks input and
  output against the JSON Schemas (stripping undeclared keys like a parse), turns `fail` into the declared branch,
  aborts on `pagehide`, and re-reads queries by tag after a local or a server mutation (`EffectResponse.tags`).
  The initial client stays at 8.0 KB (P7).
- **Bundling:** `@hozu/bundle` builds `fetch-<feature>-<hash>.js`; the handler refuses to start without it, and
  `hozu build` writes it to the manifest.

### Static hosts
- `exportStatic` writes pages whose data is `'browser'`, or `'either'` but not cacheable at export time: those
  render `pending` and read in the browser. The parsed public env goes into the page (`env` option).
- `needsServer` lists the server effects a written page still calls; `site/export.ts` and `examples/stars/export.ts`
  fail on it.

### Diagnostics
- **HZ081** `invalid-effect-runtime`: a missing or extra `fetch.ts` export, no fetch module, `'either'` with user
  data, or a Node-only import in `fetch.ts`.
- **HZ082** `effect-needs-server`: a `'browser'` query in a page `head` or `entries`; a browser mutation that
  invalidates a tag a server-cached query reads.
- **HZ036** also warns on a form that starts a `'browser'` mutation; **HZ045** covers an app with `fetch.ts` and no
  `components`; **HZ020** no longer asks for a session for a user-scoped query that runs in the browser.

### `hozu migrate`
- Upgrades from 0.10.0 on, one step per release. Pass 1 records the old IR with the app's own installed packages,
  rewrites the source and raises the ranges; pass 2 compares the IR through each step's normalisation, refreshes
  the skill and agent guide, and runs `hozu check`. `--dry-run` and `--json` (`migrate.schema.json`).

### Tools and guide
- `hozu map` shows `runs` per query and mutation and the feature's `fetch.ts`; `hozu add feature` writes
  `runs: 'server'` for its resolvers.
- Skill: the `runs` rule in `SKILL.md`; new `hozu docs fetch` (runs, `fetch.ts`, browser tokens, CORS, static
  hosts); `hozu docs deploy` says how to upgrade; `data`, `auth` and `diagnostics` updated.

### Examples
- `examples/stars`: a GitHub client that runs entirely in the browser (a token in `localStorage`, an `'either'`
  search, star / unstar) and exports to a static directory; its test hydrates the export against a fake GitHub API
  and checks no request reaches `/_hozu/`.
- Every example, the site and the skill example are migrated (`runs: 'server'`).

## 0.10.0 — Hozu DevTools (ADR 0047)

A vibe coder sees something wrong on the screen and describes it in words; the agent then searches the code for it.
Hozu already knew where every node comes from, so 0.10 lets the person point instead: under `npm run dev` they
select the part, say what should change, and hand the agent a request that names the file, line and the Hozu way to
make the change. The tool never edits source; the agent edits and Hozu checks.

**Upgrade:** additive, no change to the authoring surface, the IR or the lock. Add `"dev": "hozu dev"` and the
`@hozu/dev` dev dependency to an app's `package.json` (new apps have them), and `.hozu/` to `.gitignore`.

### DevTools (`hozu dev`)
- **Overlay:** a dock with Browse / Select, Changes, Page, Layers, Workbench and settings. Select a part (click; Alt
  goes up; double-click picks a text) to see where it is, its component and how many places use it, where its text
  comes from (literal, message, data, context), when it is shown and what it sends.
- **Look and Text:** preview font size, weight, colours, padding and corners, or other words (Longer, 中文, English),
  on the page only. A request turns styles into the class to replace and the project's theme utility.
- **Layers and states:** the page's parts from the IR, and the states that are not on screen — query `pending` and
  `failed.<Error>` branches, `when` and busy states, and context conditions (`ctx.error !== null`) — each previewed
  without running a resolver or a mutation.
- **Workbench:** the page in an exact-size frame (devices, rotate, drag to resize), Layers on the left, the
  inspector on the right.
- **Builder or Developer:** plain words by default, or files, excerpts, transitions and node ids
  (`hozu dev --devtools developer`). Light and dark follow the system.

### Requests
- One request holds every described part; Copy for AI or Save writes Markdown with Want, Where, Scope, Style, Text,
  Shown when, Mind (only where a plain edit goes wrong) and Locate.
- Saved requests live in `.hozu/requests/`. `hozu requests` lists them, `hozu requests --full` prints every open one
  as one prompt, `hozu requests done <n> --result "<what changed>"` removes one. `hozu docs requests` tells agents how
  to work them.
- `hozu locate <id|pointer|page:route>` re-finds a node after edits moved its lines.

### Zero production cost
- Markers (`data-hz`), the dev endpoints and the DevTools script exist only under `hozu dev`; production renders and
  the production client carry none, and budget P7 is unchanged (7868 B). Dev endpoints answer loopback `Host`s only,
  and `hozu serve` binds 127.0.0.1 under `HOZU_DEV`.

### Examples
- `examples/studio`: a task board with a kit, counts, filters, validation, a saved notice, a confirm dialog and a
  detail page, to test DevTools.

## 0.9.0 — declared UI components (ADR 0045, breaking)

A button, a field or a card used by several features had no declaration in 0.8: a `part()` disappears when the view
is recorded, so no tool could list it, and an agent could not tell it from a helper. Its classes fought by Tailwind's
sort order, so an override or a toggle silently lost (the showcase tabs worked by luck). 0.9 makes UI a declaration:
`ui.component` in a kit, used through `ui.use`, styled with tailwind-variants at record time, and checked property by
property. `ui.widget` is the same declaration with a `client` module.

**Upgrade:** there is no migration tool before the first stable release, and `hozu migrate` is removed. A 0.7 app
upgrades with the 0.8.0 CLI first (`npx @hozu/cli@0.8 migrate 0.8`). A 0.8 app upgrades by hand with the list
below, then runs `npx hozu check`, applies the patches HZ079 and HZ074 print, and accepts nothing new in the lock (views
are not locked).

### Upgrading by hand from 0.8
1. **`ui.widget` → `ui.component({ client })`.** `events` become `emits`, `wraps` goes, and the render is the server
   HTML the module takes over:
   ```ts
   // 0.8
   export const Map = ui.widget({ tag: 'div', props: z.object({ lat: z.number() }),
     events: { picked: z.object({ id: z.string() }) }, client: new URL('./map.client.ts', import.meta.url),
     load: 'visible', wraps: false })
   ui.use(Map, { props: { lat: ctx.lat }, on: { picked: (d) => ui.send(Pick, { id: d.id }) } }, [])
   // 0.9
   export const Map = ui.component({ tag: 'div', props: z.object({ lat: z.number() }),
     emits: { picked: z.object({ id: z.string() }) }, client: new URL('./map.client.ts', import.meta.url),
     load: 'visible', render: () => ui.div({}, []) })
   ui.use(Map, { props: { lat: ctx.lat }, on: { picked: (d) => ui.send(Pick, { id: d.id }) } })
   ```
   - A widget with `wraps: true`, or whose uses passed children, declares `children: true` and renders them:
     `render: ({ children }) => ui.div({}, children)`. A use without children passes no third argument.
   - `ui.use` options `toggle` and `vars` are gone (HZ014): the render sets them on its root from a prop.
   - The root of a client render takes no attributes and no `on` (HZ014): put a role or label on a wrapping element.
2. **`@hozu/core/widget` → `@hozu/core/component`** in every client module:
   ```ts
   import { implement } from '@hozu/core/widget'      // 0.8
   import { implement } from '@hozu/core/component'   // 0.9
   ```
   `WidgetDecl`, `WidgetLoad`, `WidgetUse` are `ComponentDecl`, `ComponentLoad`, `ComponentUse`.
3. **The bundle in `app.ts`:**
   ```ts
   import { bundleWidgets } from '@hozu/bundle'          // 0.8
   export default app({ resolvers, widgets: bundleWidgets })
   import { bundleComponents } from '@hozu/bundle'       // 0.9
   export default app({ resolvers, components: bundleComponents })
   ```
   The same rename applies to `createHandler({ widgets })`, `exportStatic({ widgets })`, `AppHost.widgets`,
   `WidgetBundle` / `assertWidgetBundle` (`ComponentBundle` / `assertComponentBundle`), `usedWidgets` / `widgetsIn`
   (`usedClientComponents` / `clientComponentsIn`) and `hydrate({ loadWidget })` (`loadComponent`).
4. **`hozu add widget <feature> <Name>` → `hozu add component <feature> <Name> --client`.** The old form is a usage
   error naming the new one.
5. **`data-hozu-widget*` → `data-hozu-component*`** on mounted hosts, in your own browser tests:
   ```ts
   page.locator('[data-hozu-widget="stations.StationMap"][data-hozu-widget-state="mounted"]')        // 0.8
   page.locator('[data-hozu-component="stations.StationMap"][data-hozu-component-state="mounted"]')  // 0.9
   ```
   Bundles are served from `/_hozu/c/…` (was `/_hozu/w/…`); `hozu browse` prints `component <id>:` lines and its JSON
   has `components` (was `widgets`).
6. **HZ079 on existing code:** two classes of one element that set the same property under the same variant are an
   error, base classes against toggles included. Apply the patch, or style the state through its attribute:
   ```ts
   // 0.8: bg-white always wins over the toggle, by Tailwind's sort order
   ui.button({ class: 'bg-white', toggle: { 'bg-indigo-600 text-white': ctx.tab === t } }, [t])
   // 0.9, the patch: a complementary toggle
   ui.button({ toggle: { 'bg-white': ctx.tab !== t, 'bg-indigo-600 text-white': ctx.tab === t } }, [t])
   // 0.9, or one source for the look and the accessibility
   ui.button({ class: 'bg-white aria-selected:bg-indigo-600 aria-selected:text-white', 'aria-selected': ctx.tab === t }, [t])
   ```
   A leading `!` is HZ074 anywhere: `!bg-red-500` → `bg-red-500!` (patch).
7. **`hozu migrate` is removed.** It answers a usage error naming `npx @hozu/cli@0.8 migrate 0.8`. `hozu skill` still
   rewrites the marked Hozu block of `CLAUDE.md` / `AGENTS.md`; run it after upgrading the packages.
8. **IR version 3.** Tools that read the IR or the CLI JSON: `FeatureIR.widgets` is `FeatureIR.components`
   (`ComponentIR`, the client in `client: { load, sourceHash }`), `ProjectIR.kits` is new, a widget node
   (`kind: 'widget'`, `widget`) is a `ComponentNode` (`kind: 'component'`, `use.component`), and the root of a pure use
   carries `use`. `hozu inspect` and `hozu impact` output is a union (feature or component), and `hozu check --json`
   always has `overrides`. The JSON Schemas are regenerated.

### New
- **Components (A–C):** `ui.component({ tag, styles?, props?, slots?, children?, events?, extend?, render })` in a kit
  (`ui.kit({ id, components, styles? })`, `project({ kits })`, id `ui.Button`) or private to a feature
  (`notes.Composer`, HZ006 from another feature). `ui.use(C, { variant, props, slots, on, class }, children)` is the
  only call form, typed from the declaration. A pure use is inlined at record time: 0 B of client JavaScript, and the
  IR equals the hand-written tree apart from `use`.
- **Closed render (C):** a render reads only `props`, `slots`, `children`, `on` and `classes`; a declaration it reaches
  is HZ070. Variants are literals (HZ071). Every component is rendered once when it is declared, so an unused one is
  checked too.
- **Styles (D–F):** `@hozu/variants` (tailwind-variants 3.3.1, tailwind-merge 3.7.0) runs at record time only;
  `hozu add kit <id>` writes `<id>/tv.ts` with the tailwind-merge config of the project's design tokens, HZ078 when
  it is stale, `--sync` to regenerate. The CSS stage reads the properties of every class from Tailwind: HZ072 (a
  caller sets an owned property; a trailing `!` is the one override), HZ073 (`!` inside a component), HZ074, HZ075,
  HZ076, HZ077, HZ079 on every element, HZ080 (a part's view inlined by two features). `hozu check` prints one line
  per component with overrides (`ui.Button: 1 override — account`).
- **Record-time literals (G):** an operation with no reference operand runs as JavaScript, so a part or a render
  called with literals gives the inline form's IR.
- **Tools (I):** `hozu docs components` (the topic, then the app's components: id, tag, variants), `hozu render <id>
  --variant k=v --props '<json>' --slot name=text` (HTML, root class, owned properties, diagnostics; exit 1 on
  errors), `hozu inspect` / `hozu impact <component id>` (the declaration and every use with its added classes and
  overrides), `hozu map` (`kits: ui 3` and `· uses ui.Button ui.Input` per page), `hozu add component <kit|feature>
  <Name> [--client]`.
- **The guide:** `topics/components.md` replaces `widgets.md`; SKILL.md gains the UI row and stays at 3 519 B.
- `examples/notes` uses a `ui/` kit (Button, Input, Field) on tv, with one `!` override.

### Measured
- P7 (initial client JS, min+gz): **7 872 B** (0.8.0: 7 893 B; the client ref lost `wraps`). No page of any example
  gains client JavaScript.
- `hozu docs components` on notes: 4 537 B (budget 5 120 B). `hozu map`: notes 3 343 B (budget 3 584 B), bookmarks
  1 450 B and trial-0007 1 516 B (budget 2 048 B).
- HZ079 on the 0.8 examples: 6 real pairs (the showcase tabs) and none of the 24 exclusive toggle pairs.
- `hozu check` cold: notes 0.56 → 0.64 s, showcase 0.60 → 0.77 s (the CSS stage reads class properties).

### Behaviour changes with no diagnostic
- A client component with children hydrates them on claim and on a client render (`wraps` is derived per node);
  island roots still ship without children, so every page hydrates what it hydrated before.
- The browser console says `Component <id> failed`, and `Hozu: component <id> has no client code (bundleComponents)`.
- The order of the classes on a component's root follows tv: owned classes, then the caller's.
- `examples/notes`: the sign-in button's corner radius is 0.5rem (the `rounded-lg!` demonstration).
- `hozu map` puts `kits:` after the files and no longer prints the ignore list of a state with `invoke`: it is
  derived (every event the state does not handle).

### Also
- An inline `styles: tv({ … })` next to a destructuring render types correctly: `@hozu/variants` types `tv()` with
  an intersection result, because TypeScript skips a generic call that returns a plain function type while it
  infers the surrounding call.
- `hozu browse`'s 20 s budget per run is asserted only when its test file runs alone (`HOZU_BUDGET=1`); the bench
  runs it once (row B1).
- `@hozu/ui-kit` is reserved for the official component library.

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

### Found while migrating the trial reference to 0.8
- HZ016 counts only the `machine({ on })` copies of one entry as covered together; an identical transition or `done`
  branch of another state needs its own contract.
- `hozu migrate` keeps the 0.7 IR in `.hozu/migrate-0.7.json` (a reinstall keeps it) and says when the comparison
  cannot run; it prints every hand-built redirect or 4xx `Response` and create-on-read reached through another
  module; its rewrites keep the file's indentation, quotes, semicolons and import layout.
- HZ025 is silent for a page whose head query is user-scoped (private pages stay out of the sitemap); HZ046 no
  longer offers "one of (none)".
- Query branches and `ui.each` items may return `c ? a : [b, c]`.
- A clean checkout builds in one `pnpm build` (the CLI's project references include `@hozu/transform`).

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
