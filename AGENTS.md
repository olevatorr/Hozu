# Hozu — AI-first frontend framework

Agents without skill support: before writing Hozu code, read `.claude/skills/hozu/SKILL.md` (the `hozu` skill below).

## North star
Make invalid AI-generated programs structurally difficult to express,
and make valid programs cheap to verify.

Pipeline: `feature() source → Feature IR → validator → compiler → runtime`.
The IR is the source of truth. TS source is a typed authoring surface over it.

## Non-negotiable principles
1. One canonical form per concept. No syntax sugar, no aliases. Formatter normalizes.
2. Explicit over implicit. No auto-imports, no global injection, no file-based magic. An endpoint form body is
   multi-valued exactly where its input schema declares an array (ADR 0043 C).
3. No stringly-typed cross references where a declaration identity is possible.
4. Closed world: views are constrained `ui()` trees, never arbitrary functions; reusable view logic is a `part()`,
   lowered like a builder callback and inlined at record time, so the IR holds no function (ADR 0043 H).
   A component's render is closed: it reads only its props, slots, children and `on` handles; JavaScript runs only
   in a component's declared `client` module (ADR 0045).
   Side effects only via declared `query` / `mutation` / `endpoint`, plus the framework-owned
   `navigate` (on a transition) and `after(ms)` (on a state). Query resolvers only read; writes happen in mutation and
   endpoint resolvers. That is not checkable: the scaffold and `hozu docs data` teach it
   (ADR 0043 B). Logic is data: operators and
   assignments in builder callbacks are lowered by `@hozu/transform` to the `op.*` IR (ADR 0039);
   anything else is a named, schema-typed `fn()` (ADR 0002 D1).
5. Every behavior change requires a reviewed change: a contract (given / when / expect) for transitions that decide
   (a guard, `navigate`, a `fn` value); the readable lock entry for transitions that only copy values (ADR 0037).
6. Feature boundaries are enforced: features import only other features' public contracts (`exports`).
7. Diagnostics are structured JSON with location, cause, and suggested fix.
8. Rendering mode is DERIVED, never chosen:
   - query declares `scope: 'public' | 'user'` and
     `freshness: 'static' | 'request' | { revalidate } | { swr } | 'live' | { poll }`
   - compiler derives a per-node render plan (static / ISR / SWR / per-request / streamed SSR / client);
     `'request'` is a per-request region in either scope
   - `scope: 'user'` data must never reach a cacheable region (hard error) and is never cached across requests:
     its freshness is `'request'`, `'live'` or `{ poll }` (HZ049, ADR 0043 A, ADR 0063 C1)
   - only nodes bound to a machine hydrate; everything else ships 0 JS
   - `render: 'static'` style assertions are allowed but validated, never obeyed blindly
9. Framework-owned fetch: queries have tags, mutations and endpoints declare `invalidates`.
   Server-fetched data is serialized into the payload and never refetched on the client.

## Explicitly out of scope
- Pure SPA mode as a separate concept (it is the all-user-scoped case)
- Arbitrary effects inside views
- Manual route-level cache config
- Global mutable client stores (cross-feature state goes through `exports`)

## Tech
- TypeScript strict (TS 7), pnpm workspaces, Vitest, Biome
- Node ≥ 22.18: `hozu.config.ts` is loaded with native type stripping, so authored code is
  erasable-syntax TS with explicit `.ts` relative imports
- Schemas: Standard Schema compatible, exactly one adapter per project (`project({ schema })`;
  `@hozu/schema-zod` is the default, Valibot via adapter). The IR stores JSON Schema.
- Packages are published under the @hozu/ scope:
  `@hozu/core` (IR types + builders; tooling at `@hozu/core/ir`), `@hozu/schema-zod`,
  `@hozu/machine` (isomorphic compiled interpreter, ADR 0004), `@hozu/data` (resolvers, cache,
  tags, dedup, ADR 0005), `@hozu/validator`, `@hozu/compiler` (render plans, ADR 0006),
  `@hozu/runtime-server` (in-order streaming SSR + the web-standard handler, ADR 0007/0016), `@hozu/runtime-client` (own fine-grained
  DOM runtime, no VDOM, replace-hydration of islands, ADR 0006/0007),
  `@hozu/cli`, `@hozu/adapter-node` (ISR page cache + tag revalidation), `@hozu/adapter-static`,
  `@hozu/css` (Tailwind v4 bound, compiled from the IR's class candidates, HZ026, ADR 0009),
  `@hozu/dev` (dev server: CSS hot swap, reload on code changes), `@hozu/image` (optional WebP srcset, ADR 0017),
  `@hozu/content` (Markdown collections, ADR 0020), `@hozu/testing` (render assertions, ADR 0021),
  `@hozu/bundle` (client component modules, esbuild), `@hozu/variants` (tailwind-variants run at record time;
  `/config` generates the tailwind-merge config, ADR 0045 D), `@hozu/devtools` (the DevTools overlay and request
  files, ADR 0047); `@hozu/ui-kit` is reserved for the official kit
- Every `@hozu/*` package except `@hozu/schema-zod`, `@hozu/css` (Tailwind), `@hozu/bundle` (esbuild),
  `@hozu/image` (sharp), `@hozu/content` (marked, yaml) and `@hozu/variants` (tailwind-variants, tailwind-merge) has zero
  third-party runtime dependencies.
- Views: every HTML/SVG element with per-tag typed attributes, all DOM events, `ui.dom.*` event fields (HZ027),
  `class` (static) + `toggle` (guarded class groups) + `vars` (CSS custom properties). No `style`, no free
  functions. Stylesheets: `project({ styles })` Tailwind entry + `feature({ styles })`; classes must produce CSS
  (HZ026), hooks use `data-*`. `when`/`ui.each` take an optional motion name (enter/leave/move classes); conditions are
  `c ? a : b` / `c && a` (a branch may be a list), and `ui.if(c, a, b, motion)` exists only with a motion. Also
  `part((…) => …)` (reusable view logic, inlined at record time; a plain helper that receives data is HZ059, ADR 0043 H),
  `ui.link(route, params)`, `ui.window`/`ui.document`, `ui.html` (HZ030 for untrusted values),
  `ui.asset(url)` (HZ028 for img without dimensions).
  Literals are checked against their schema (HZ031); enumerated attributes (`type`, `method`, `loading`…) are typed.
  Internal links are `ui.link` only: a string `href` starting with `/` is HZ032 (ADR 0012).
- Agent guide: the `hozu` skill (`.claude/skills/hozu/`: `SKILL.md` = the change loop, the "What to touch" table, the
  rules no diagnostic checks and the topic index, ≤ 4 096 B with its frontmatter and tested (ADR 0043 K); `topics/*.md`
  one short topic each, printed by `hozu docs <topic>` (ADR 0038 R1; `hozu docs feature` has the tested build
  example), and `example/` = a generated copy of
  `examples/bookmarks`) is the authoring reference; it ships in `create-hozu` and is written into apps by
  `create-hozu --agent claude|agents|both` and `hozu skill`. `pnpm skill` regenerates `example/` and `AGENTS.md`
  (from this file); a test fails when they are stale; `examples/bookmarks` is its verified reference app. Keep both in sync with any API change. Busy states declare `ignore: [Event]` (HZ005, HZ034);
  `ui.dom.value` / `ui.dom.form(name)` may feed enum fields only from literal `<select>`/radio options (HZ033) (ADR 0013).
- Components (ADR 0045; widgets of ADR 0009 merged in): `ui.component({ tag, styles?, props?, slots?, children?,
  events?, extend?, render })` in a kit (`ui.kit({ id, components, styles? })` in `project({ kits })`, id `ui.Button`)
  or private to a feature's `declarations` (`notes.Composer`, HZ006). `ui.use(C, { variant, props, slots, on, class },
  children)` is the only call form. `styles` is a `tv()` result from the kit's `tv.ts` (`hozu add kit`, HZ078 when
  stale); variants are literals (HZ071); the render is closed (HZ070) and Hozu sets the root class. A caller's
  `class` sets no owned property except with a trailing `!` (HZ072–HZ077); two classes of one element setting one
  property is HZ079; a part's view inlined by two features is HZ080. With `client` + `load` (+ `emits`) a component
  is browser code: `export default implement<typeof C>(setup)` from `@hozu/core/component` (type-only import),
  bundled by `@hozu/bundle` (`app({ components: bundleComponents })`), HZ029.
- Server capabilities (ADR 0010): client fetch of new query keys, live queries over SSE, `head.failed`,
  `setSession` with a server-side store (`memorySessions()` by default: opaque signed id, revoked on sign-out;
  production needs `SESSION_SECRET`; ADR 0043 B), `project({ notFound })`, `site.icon` / `themeColor`, uploads via
  `ctx.file`.
- Routes: `route({ path: '/posts/:slug', params: schema | null, search: schema | null })` (search: flat scalars with
  defaults, HZ035; canonical URLs, ISR keyed by canonical URL); `ui.link(route, params, search?)` is the only internal
  URL form, also for `navigate: (arg) => ui.link(...)` on transitions (contracts expect `{ navigate: url }`).
  Forms whose submit reads only `ui.dom.form(name)`/context/params/search also work without JS: the server runs the
  machine for a native post (HZ036 warns otherwise). `project({ notFound, error })`; adapter-node sends CSP (script
  hashes), nosniff and rejects cross-site POSTs; `app({ onError, csp })` (ADR 0014).
- Navigation (ADR 0043 I, supersedes ADR 0015): every internal link is a document navigation with speculation
  prerender and the cross-document View Transition opt-in; state across pages lives in the URL (seed), on the server
  (queries) or in a client component's own storage. There is no soft navigation and no budget P8.
- HTTP (ADR 0016): the server is `createHandler(options).fetch(Request): Response` in `@hozu/runtime-server`
  (no `node:*` in the runtime import graph; `@hozu/adapter-node` is a bridge + `publicDir`). `project({ http })`:
  `basePath`, `trailingSlash` (308 to the canonical form), `redirects` keyed by path (HZ037), per-route `headers`
  (HZ038, HZ039); no rewrites. `hozu build` writes `dist/public` + `dist/manifest.json`, and
  `buildProject(project, { manifest })` needs no file system (edge; `examples/cart/edge.ts`, checked in a web-only
  vm and on Bun). Budget P9 (req/s through adapter-node) is report-only.
- i18n (ADR 0017, ADR 0043 F): the URL holds the language: `site.lang` keeps its URLs, other `site.locales` are
  prefixed (`/de/x`; `/en/x` → 308 `/x`; no Accept-Language redirect; HZ060); `ui.messages(base, {...})` in the
  feature's `declarations`, `ui.format.*` (Intl),
  `locale` ref, `ui.alternate(l)`; hreflang/og:locale/sitemap derived. Messages and formats are lowered on the server
  for the page locale (islands get only its strings; helpers live in `fns.js`, P7 unchanged). HZ040–HZ042.
- Images (ADR 0017): optional `@hozu/image` (build-time, sharp) → `optimizeImages(build)` makes WebP widths for raster
  `<img src={ui.asset}>`; the renderer adds `srcset`/`sizes` (IR unchanged). `hozu build` uses it when the project
  can resolve it; otherwise images are served as-is.
- Route grammar (ADR 0018): URLPattern modifiers `:x?` (nullable), `:x+`/`:x*` (string[]), one parser
  (`routePattern` in core) for server, validator and speculation rules; HZ024 checks the schema per modifier.
  Load more = machine-held cursors + one `ui.query` per page (pattern, `examples/feed`); framework event `visible`
  (lazy IntersectionObserver chunk, `data-hozu-visible` added at build).
- Phase 8a (ADR 0019): `project({ env: { server, public } })` parsed at startup (`ctx.env` in resolvers, `ui.env(Schema)`
  in views, lowered for islands); every mutation has the framework error `Invalid` `{ message, fields }` (schema
  failures and `fail('Invalid', …)`), optional in `failed`, reserved as a declared name (HZ014). Optimistic UI =
  render the in-flight value in the busy state. P7 budget 8 KiB; P2 exponent over 250–2000, 5 interleaved rounds.
- Phase 8b (ADR 0020): `@hozu/css` adds size-adjusted local fallback faces for local font files (metrics from
  head/hhea/OS/2, node:zlib only); `@hozu/content` (marked + yaml, server-side) = Markdown collections returned by
  query resolvers; `@hozu/dev` serves a development client bundle (`globalThis.__HOZU_DEV__`) that restores machine
  snapshots across code reloads when the machine IR is unchanged (production bundle strips it).
- Tier 4 (ADR 0021): preview mode (`createHandler({ preview: { secret } })`, signed cookie, `ctx.preview`, no cache,
  noindex); `ui.og({ title, subtitle })` → `/_hozu/og.png` rendered by an injected `og` (`ogImage` from
  `@hozu/image`); derived web manifest + opt-in `site.offline` service worker (HZ043); `@hozu/testing`
  (`testApp(...).get/post` → `{ status, headers, html, text, payload }`).
- Authoring surface (ADR 0022): absent values are omitted (optional, no `null` spelling; behaviour-deciding fields
  such as query `scope`/`freshness`, `initialContext`/`initial` and route `params`/`search` stay required).
  `feature({ id, intent, declarations, imports?, exports?, styles? })`: `declarations` is a list of modules (ADR 0041,
  `[model, views]` from namespace imports; exported declarations are sorted by brand, other exports ignored; a second
  machine or a name two modules declare is HZ013; the record form is HZ014); `exports` is a flat list. Contracts:
  `given.context` is a deep patch over `initialContext` (omitted = `initialContext`), `expect.changes` is a deep patch
  (unmentioned fields must stay equal, arrays replace), `expect.effects` defaults to none. Feature layout: `model.ts`
  + `views.ts` + `feature.ts`.
- Output (ADR 0023): the page payload lists island node ids once (`ids`) and islands as runs
  `[node, lead, ...scopeTails]` in marker order (feature = node id prefix); node/machine JSON is cached per object.
  `<head>` modulepreloads `client.js` (+ `fns.js` when bound) only on pages with islands. `bench/frameworks` bundles
  the Hozu row with the production module graph and `__HOZU_DEV__ = false`.
- Rendering (ADR 0024): server HTML comes from generated JavaScript source (`generateRender(build, images)` in
  `@hozu/runtime-server`, one function per route × non-suspending node × island × separator), the only render path.
  Node imports it as a `data:` module at startup; `hozu build` writes `dist/server/render.js`, which edge entries
  pass as `createHandler({ render })` (no eval on the edge). `ui.query` streaming stays interpreted. All IR strings are
  embedded with `JSON.stringify`.
- Name (ADR 0026): the framework was called Tenon until 0.1.0; it is **Hozu** (ほぞ, Japanese for "tenon").
  Historical records (ADRs 0001–0025, `docs/trials`, `docs/benchmarks`) keep `Tenon`, `@tenon/`, `tenon.config.ts`
  and `TN0xx` codes; everything else uses `Hozu`, `@hozu/`, `hozu.config.ts`, `/_hozu/` and `HZ0xx`.
- Release (ADR 0025, 0061): npm scope `@hozu/*`, plus unscoped `create-hozu`; the binary is `hozu`. A pushed `vX.Y.Z` tag runs
  `.github/workflows/release.yml` `publish` after the owner approves the `npm` environment (npm Trusted Publishing,
  Node 24, no token): `scripts/publish.ts` publishes the 20 `@hozu/*`, then `create-hozu`. No checks run there: the
  assistant runs the gate and review before the tag, and checks npm and a fresh install after.
- 0.5 (ADR 0037): contracts only for deciding transitions, the lock summarises every transition (`was/now` in HZ018,
  `--update-lock` accepts copy-only changes); states with `invoke` drop unhandled events (listing `ignore` there is
  HZ014) and `done` / `failed` take a state name, a transition or a guarded list; `ui.query` `pending` is optional;
  `hozu add widget` (0.9: `hozu add component --client`); `endpoint({ method, path, input, output })` declarations implemented in resolvers (HZ046).
- 0.5 (ADR 0038, 0039): builder callbacks are ordinary TypeScript (`===`, `?:`, `&&`, `??`, template strings, `+`,
  `ctx.x = v`, `+=`, `.push`, the `.filter` removal) lowered by `@hozu/transform` (acorn + Node's type stripping,
  newline-preserving; Node `--import @hozu/transform/register`, `hozuTransform()` for Vite / esbuild, the CLI
  registers it). Views / machines from untransformed code are HZ044 (the server refuses to start). `Ref<T>` is `T`.
  Operator builtins `%truthy %cond %coalesce %concat %length %plus %minus`. The skill is a short `SKILL.md` plus
  `topics/*.md` printed by `hozu docs <topic>`; diagnostics end with `see: hozu docs <topic>`.
- 0.6 (ADR 0040): `hozu browse <path> --do '<step>'` drives an installed Chrome / Chromium / Edge over CDP (pipe, no
  deps, no port; requests go to the in-process handler) and reports errors, client components (`data-hozu-component` +
  `data-hozu-component-state` on hosts; widgets until 0.9), text, `--select`, `--screenshot`; HZ047 = a `fn` body using names from outside
  `impl` (the server refuses to start); no `site.icon` → `<link rel="icon" href="data:,">`.
- 0.7 (ADR 0041): `ui.view({ machine, route, seed: ({ params, search }) => ({ field: search.x }) })` starts the page's
  machine from the URL (`ViewIR.seed`; server render, payload `initialContext`, no-JS posts; HZ048); `machine({ on })`
  = transitions copied into every non-busy, non-final state that does not handle or ignore the event (no `target` =
  its own state; HZ016 counts the copies of one entry as one); `fn` bodies may call self-contained module helpers
  (transform `__hozu.helpers`, shipped in `fns.js`; imports / `let` stay HZ047); `ui.use` `on` optional; query
  branches may return `null`; recipes moved from `changing.md` to `hozu docs recipes`.
- 0.8 (ADR 0043 D, E): one app module, `project({ app: new URL('./app.ts', import.meta.url) })` default-exporting
  `app({ resolvers, session?, components? })` (`widgets?` until 0.9), run by `hozu serve` (`npm start`), `hozu check` (HZ045, HZ021),
  `hozu get` / `browse` and `testApp(app)`; edge: `createHandler(app, { manifest, render })`. Pages answer through
  `head.failed` (a route, 403, 404 or 410; HZ051); endpoints have `errors` + `failed`, `output` schema / `'redirect'`
  / `'response'` (no HTML, HZ053), `input: 'raw'`, `ui.link(endpoint, input)` and `exports`; a route without a page
  is HZ052.
- 0.8 (ADR 0043, breaking; `hozu migrate 0.8` rewrote 0.7 apps, removed in 0.9): user data is `freshness: 'request'` or `'live'`
  (HZ049; `'request'` also for public data, replacing `{ revalidate: 0 }`; `'live'` needs tags, HZ050), exact
  invalidation, endpoint `invalidates` (HZ062 on GET), `server.revalidate([tag()]) → { entries, pages }`, derived
  `Cache-Control` / `Vary`; a session change is a barrier (post-mutation session, `session: true`, scoped
  `/_hozu/live`); forms: `ui.dom.formAll(name)` (every value; `form` is the first), the submitter included, one
  decoder `formEntries`, `ui.formRef()` for controls outside the form (HZ054–HZ056, HZ061, HZ063), an invalid native
  post answers 400; `part()` (HZ059 for references in plain JavaScript); `op.*` and the motion-less `ui.if` removed;
  the lock is v2 (`decides`, fields, normalised contract hashes, `pages`) and must equal the computed one (HZ057,
  `hozu check --update-lock`), a contract over copy-only transitions is HZ058, a duplicate HZ064; `ui.link(route,
  params)` with `search` optional; i18n (c): `site.lang` unprefixed, other locales prefixed (HZ060); no soft
  navigation; `hozu browse --js on|off|both` (default both), `--as <name>` actors, `--session`, `in "<text>"` targets;
  `hozu post` is gone; `hozu get` / `browse` / `testApp` refuse a broken build; `hozu map` starts with the session
  shape, the verify line and the files; the agent's `CLAUDE.md` / `AGENTS.md` block sits between `hozu` markers that
  `hozu skill` rewrites (and `hozu migrate 0.8` did, until 0.9 removed it).
- 0.9 (ADR 0045, breaking): `ui.component` and kits replace `ui.widget` (`@hozu/core/component`, `events` of a
  client → `emits`, `wraps` derived, `data-hozu-component*`, `/_hozu/c/`, `hozu add component <kit|feature> <Name>
  [--client]`); IR v3 (`ProjectIR.kits`, `FeatureIR.components`, `ElementNode.use` on a pure use's root,
  `ComponentNode` for client uses). A pure use is inlined at record time (0 B JS; IR equal to the inline form apart
  from `use`), and an operation without a reference operand runs as JavaScript at record time. HZ070–HZ080 (the
  class rules read the properties from Tailwind in the CSS stage); `hozu docs components` (the topic, then the app's
  list), `hozu render <id>`, `hozu inspect` / `impact <component id>`, `hozu map` `kits:` and per-page components,
  `hozu check` override counts, `hozu add kit <id> [--sync]`. `hozu migrate` is removed: no migration support before
  the first stable release (0.8 apps upgrade by hand from the CHANGELOG).
- 0.10 (ADR 0047): Hozu DevTools under `hozu dev` (`npm run dev`; `--devtools builder|developer`,
  `--no-devtools`): a dev build stamps `data-hz="<node id>"` on every element (production renders and the
  production client carry none, P7 unchanged); Select a part to see its file:line, component, text source, branch
  and behaviour; Look (styles → theme utilities) and Text previews; Layers with the page's states (query branches,
  `when` and busy states, context conditions) previewed through the dev-only cookie `hozu-dev-state`; Workbench
  (an exact-size frame). A request is Markdown (Want / Where / Scope / Style / Text / Mind / Locate) copied or
  saved to `.hozu/requests/` (`.next` keeps numbers unique); `hozu requests [--full] [done <n> --result]`
  (done removes the file), `hozu why <id|pointer|page:route>`, `hozu docs requests`. Dev endpoints answer
  loopback `Host`s only; `examples/studio` is the DevTools test bench.
- 0.11 (ADR 0049): queries and mutations declare `runs: 'server' | 'browser' | 'either'` (default `'either'`, which
  needs `scope: 'public'`); `'browser'` / `'either'` are implemented in `feature({ fetch: new URL('./fetch.ts', …) })`
  (`implement` from `@hozu/core/fetch`, one export per effect, bound by name, `{ fail, signal, env }` with the public
  env). `'either'` renders on the server and reads / mutates from the browser afterwards; `'browser'` renders
  `pending` (region mode `browser`) and never runs on the server (400 on `/_hozu/query` / `/_hozu/effect` and native
  posts). The lazy runner chunk checks every boundary against the JSON Schemas and re-reads by tag (P11 ≤ 3 KB);
  `@hozu/bundle` builds `fetch-<feature>-<hash>.js`; `exportStatic` defers non-cacheable `'either'` data to the
  browser and lists `needsServer`. HZ081 (exports, Node-only imports, `'either'` + user scope), HZ082 (browser data
  in head / entries, browser mutation invalidating server-cached tags), HZ036 for browser mutations.
  `hozu migrate [--dry-run]` upgrades from 0.10.0 on (records the old IR with the app's own packages, rewrites,
  raises `@hozu/*`, verifies the IR per step, never writes the lock); 0.10 → 0.11 adds `runs: 'server'`.
  `examples/stars` is the static-host reference (a GitHub client from the browser alone).
- 0.12 (ADR 0050, benchmark 0003): bounded LRU caches (`memoryDataCache({ maxEntries })` via `app({ dataCache })`,
  `memoryCache({ maxPages })`, tag index), `server.stats()`; `app({ bus })` (`InvalidationBus`, `localBus`,
  `httpBus({ peers, secret })` = signed `POST /_hozu/invalidate`) and `app({ staticTtl })`; per-feature fn modules
  `/_hozu/f/<feature>-<hash>.js` (`fnModules()`; only client-reachable fns; payload `fns: string[]`) and page-scoped
  payload `routes`; `hozu check` runs tsc in parallel (`--incremental`, `.hozu/check/`) with a transform cache in
  `.hozu/transform/` and `--json` timings; `hozu call <feature>.<effect> [--input] [--session] [--write]`; DevTools
  API tab (`pageEffects`, `/_hozu/dev/effects`); `runs` in inspect / impact / explain / Layers; migrate 0.11 → 0.12
  adds `.hozu/` to `.gitignore`. Budgets P12 (check after an edit at 500 features ≤ 2.6 s, `pnpm bench:scale`), P13
  (data cache bounded). `bench/scale` generates the large apps.
- 0.13 (ADR 0051, 0052): the DevTools API drawer (bottom, overlay and Workbench; read / write rows with inline input
  or JSON, file:line from `/_hozu/dev/effects`, tables, History, Copy as hozu call / curl; mutations confirm in the row
  and re-read the page through the dev client's `window.__hozu.invoke`; Requests it sent from a dev fetch trace
  `/_hozu/dev/trace` and the page; Act as via `/_hozu/dev/session`; Endpoints via `/_hozu/dev/endpoints`);
  `feature({ connect: [origin | { env }] })` → CSP connect-src (HZ083 for undeclared literal or env URLs);
  `project({ env: { files, internal } })` (CLI reads files; `'either'` on the server reads internal URLs),
  `hozu env [--example]`, HZ084 public secret, HZ085 bad internal mapping, HZ086 env file not git-ignored;
  `examples/playground`; `pnpm pack:release` packs from a clean build.
- 0.14 (ADR 0053, breaking): `runs` required on every query / mutation (migrate adds `'either'`); `hozu validate`
  removed (`hozu check --no-types`); `project({ accept: [{ code, at, reason }] })` keeps a warning on purpose (HZ087
  stale entry; errors cannot be accepted); `codes.ts` holds each code's summary / fix / topic, generating the
  diagnostics topic and the site table (`hozu docs HZ0xx`); topics have a short form above `<!-- more -->`
  (`hozu docs <topic> --more`, default ≤ half of 0.13's 72.7 KB, tested); `hozu why <declaration | component |
  state | node | page:route>`; `impact` / `explain` / `locate` deprecated (removed in 0.15), `graph` removed;
  ADR 0055 pre-registers trial 0024 (cold / warm / Nuxt).
- 0.15 (ADR 0056, breaking): declared access: every `runs: 'server'` `scope: 'user'` query and server mutation has
  `access: 'anyone' | 'signedIn' | { allow } | { owner: { row, session, load?, input? } }` (no exports; callbacks
  lowered like guards, `AccessIR` with `session` refs; HZ088 missing / bad field, HZ089 unenforced, HZ090 user data
  for anyone, HZ091 a list with foreign rows: dev error, prod dropped + logged once); the framework error `Forbidden`
  (reserved, optional in `failed`, unmapped head → 403); access in the lock (`pages.access`), `hozu why` and `map`;
  migrate 0.14 → 0.15 adds `access: 'anyone'`. Tools: `hozu call` on endpoints (`--header`, POST needs `--write`),
  `hozu browse --header` (per actor), `remember <name> from url|<selector> [@attr]` + `$name`, `post <path> a=1`.
  `impact` / `explain` / `locate` removed (`hozu why`). Fixes from the 0.14 dogfood (ADR 0056 A1–A16): client
  `ui.link` attributes re-evaluate, endpoint `fail` data reaches the response, empty env = unset, `hozu plan <path>`,
  `--update-lock` prints the accepted lines, per-command `--help`, `hozu serve` runs as production, `og:locale` with
  region and sitemap alternates, `bench:frameworks` repaired (B2 in `pnpm bench`, 50 ms). Perf: fn modules are
  ordered module scripts that register by URL, so hydration does not wait on `import()` (hydrate 41 → 6 ms).
  Phase D: `hozu show <id|pointer|page:route> --note "…"` (`--page`, `--done <n>`, `--clear`) writes
  `.hozu/notes.json`; `hozu dev` serves `/_hozu/dev/notes` (loopback only; reply → a saved request, DELETE),
  pushes `notes` over the dev SSE (one connection: the dev client re-dispatches `hozu:notes`), and DevTools draws
  numbered frames plus an Agent panel (Back / Next, Send reply, Done); `hozu dev` hides the app process's URL line
  and ignores `.hozu/` changes. `bench/meta` = Next.js / Nuxt / SvelteKit / Hozu in production servers.
- 0.16 (ADR 0057): owner `load` fails closed (any load failure → Forbidden); share cards derived (og:image size/alt,
  `twitter:card`), `entries.lastmod`, `site.url: { env }` (HZ085); P7 7 884 B (component use and list move animation
  load with their chunks); SSR back to the 0.9 level (per-IR-object memo of island walks); adapter-node compression
  (pages gzip flushed when the stream waits, files br/gz from `hozu build`), `hozu dev` asks the app for identity;
  `hozu show`/`why` take `views.ts:line`, `show --in`, stale notes; browse: 401/403/404/410 is the step's status,
  `in "<text>"` either side, `;`-joined steps, `Did you mean`; transform keeps newlines inside `?:`/`&&`/`??`;
  HZ014 unknown head field, HZ046 derived paths, HZ054 exclusive branches; pages lock without machines; `bench/meta`.
- 0.17 (ADR 0058): DevTools for Figma hands (both Builder and Developer): Shift+Enter / Enter / Tab move the selection,
  Alt measures (red px lines; `measure.ts`), the selection shows `W × H`, the Design panel (was Look) follows Figma's
  order (Frame, Auto layout, Layer, Fill, Stroke, Effects, Text) with width, height, gap, opacity, border and shadow
  mapped to theme utilities, Builder shows tokens first; Figma's words (This instance only / Main component, Resolve,
  Frame); request Markdown and the CLI unchanged. `feature({ styles })` not a list is HZ014. Assets: a full-screen
  board of every component × variant + previews (`componentCatalog`, `dev.render`, `/_hozu/dev/component(s)`),
  Where used, Change the main component, Styles (tokens). `project({ previews })` (`@hozu/core/preview`:
  `p.component`, `p.page` + `p.data` / `p.fail`) is for people: loaded only by `hozu dev` / `check`, a
  page screen swaps query results under `dev` only (cookie `hozu-dev-preview`), HZ092 keeps it honest, agents read
  it only when asked. `hozu dev` takes its app down on SIGTERM / SIGKILL.
- 0.17.2 (ADR 0059): `hozu export [--out dist]` (static host; `.nojekyll`; exit 1 listing skipped pages and server
  effects; create-hozu adds `@hozu/adapter-static`); `kvSessions(kv, { secret })` (Cloudflare KV's get / put
  { expirationTtl } / delete; opaque signed id, deleted on sign-out; `createHandler(app, { session })` on Workers);
  `hozuTransform()` (esbuild) gives app files their own `import.meta.url` (Workers have none); static export under
  `basePath` writes sitemap.xml / 404.html under the base; migrate 0.14 → 0.15 renames a user `Forbidden` error to
  `NotAllowed`; DevTools message uses count page heads and attributes; `hozu build` writes `server/render.d.ts`; trial acceptance
  runs `@hozu/cli serve`.
- 0.18 (ADR 0060): `app({ refreshSession: (session, { env }) => next })` (once per request before any resolver; new
  value stored in place via `SessionStore.update`, cookie unchanged; `null` signs out; shared per session; typed from
  `resolvers(project)`); DevTools strings go through `t()` (`packages/devtools/src/messages.ts`), translated by the
  person's file (`hozu devtools messages [--check]`, `hozu dev --devtools-messages`, `HOZU_DEVTOOLS_MESSAGES`);
  request Markdown and CLI stay English; a failed head query evaluates no head field (title = site name); HZ014
  for a computed `navigate` gives the guarded list; `hozu browse --viewport WxH`. 0.18.1: DevTools names a client
  component's module (`DevNode.component.client`) and offers no way inside it. 0.18.2 (ADR 0062): `hozu dev`
  reloads only for files the app loaded (reported by an `--import`ed async load hook over IPC), CSS, `.env*`,
  `package.json`, `tsconfig.json`; any `.ts`/`.json` while the app is down.
- 0.19 (ADR 0063): the guide no longer teaches server memory as storage (SKILL.md: where data lives is the
  person's call, ask; `demo…` stand-ins; `hozu docs data` opens with whose data it is; recipe "A personal list
  without sign-in"; `examples/watchlist`); `freshness: { poll: s }` (5 ≤ s ≤ 86 400, any scope / runs;
  `payload.poll`, lazy `poll.ts` re-reads the mounted keys on a timer, public data cached for s / 2);
  `target: 'previous'` (snapshot `previous` only for machines that use it, contract `given.previous`, HZ007 when a
  `done` / `failed` / `after` return has nothing to return to); a field alone is a guard; a transition that stops
  deciding is reviewed by the lock alone; `hozu browse` reports reloaded / navigated / in place per step (`--full`:
  replaced count), `hold <feature>.<effect>` / `release` (runs: 'server' mutations), targets by accessible name;
  SVG shapes take optional children; `@hozu/css` hoists `@import url(…)`; `@hozu/cli` carries copies of
  create-hozu's agent writer and the skill (`pnpm skill`), so it no longer depends on `create-hozu`.
- 0.20 (ADR 0064): diagnostics warn about real problems, never about needing JavaScript, and the guide says what to
  watch for, not what is allowed; transitions take `refresh: () => [tag()]` (machine effect `refresh`, the client
  re-reads browser-run queries and posts `%refresh` to `/_hozu/effect` for server-run ones; no write or
  invalidation) and `copy: (arg) => text`; a bound render gets `is([...])` (`{ ref: 'state' }`); HZ036 no longer for
  browser mutations; HZ005's fix handles before ignoring; `hozu browse` defaults to `--js on`; P7 budget 9 KiB; an
  `on` without `target` stays (IR `stay: true`, no new entry, timers and invoke continue; the lock prints `stays`),
  naming the state enters it again; `refresh` naming an uncarried or only server-cached tag is HZ019. 0.20.1
  (ADR 0065): `hold` also holds browser-run mutations (browse wraps `/_hozu/c/fetch-*.js`); `previous` is the last
  state without `invoke`; browse targets match without symbols when nothing matches exactly. 0.20.2 (ADR 0066, issue
  #1): `Manifest.sources` holds component and `fn` fingerprints, read by a build given a manifest (bundlers reprint
  function text); `@hozu/bundle` loads Node and esbuild lazily; DevTools Copy for AI saves the request first (one
  file per request text, shared with Save request) and copies it with a last line naming the file and `done` command.
- 0.21 (ADR 0067, Continuity): a query region keys on its branch, not its input, so a changed input keeps the DOM
  (`aria-busy`, counted per parent) and updates by key, `pending` only before the first answer, a failed request is
  `Unexpected`; what an update adds (an empty region filled, rows added) fades in (Web Animations, not with reduced
  motion, swaps do not fade); views each page lists once on two or more pages get `data-hz-view` (core build,
  `sharedViews`) and a `view-transition-name` from `@hozu/css`; machines a page shares with the next keep their
  snapshot in `sessionStorage` (lazy `keep.ts`; saved on click and pagehide; `who` = session hash, `null` on
  cacheable pages of session apps; `seeds` from the address; the page hydrates the server's view, then
  `app.resume()`, after `prerenderingchange` when prerendered; not on reload, in frames or DevTools previews);
  `hozu browse` reports `flashes` and `shift` (layout shift 500 ms after input); `is([...])` for structure (transform
  lowers calls of render params; HZ005 via `stateSplit`); `ui.set(field, value)` (build adds `Set_<field>` + a staying
  shared `on`, payload checked against the context schema, name clash HZ014); `replace` transition effect
  (`history.replaceState`, native post redirects to it, a route no page of the machine shows is HZ014); every
  transition effect, `navigate` included, reads the post-assign context; component `sourceHash` = recorded render
  shape (callbacks recorded with placeholders); lock lines list changed fields; no module-level randomness (Workers);
  P7 8 935 B. 0.21.1: busy states also ignore `ui.set` events (no HZ005 for a field visible while saving); the
  example app, topics and site use `ui.set` / `is()`.
- 0.22 (ADR 0068, 0069): `remote(options, decls)` in `@hozu/data` implements `runs: 'server'` effects in a Go
  service (`hozu gen` writes the contract; HZ093; required 16+ character secret; headers, preview and uploads cross;
  `examples/notes-go`, `bench/remote`); from the CMS / shop admin / storefront trials: `seed` reads queries
  (`query(decl, input)`, `ViewIR.seedQueries`, plan regions), resolvers `fail('Forbidden')`, `access: 'signedIn'`
  narrows `session`, invalid query input reaches `onError`, `head.input/render` get `search`, links to the page shown
  get `aria-current` (`currentOf`), `<dialog open>` bound to the machine calls `showModal()` / `close()`,
  `ui.format.plural`, `null` / `false` dropped from children lists, `rel` on `a` / `area` / `form`, HZ033 accepts a
  hidden enum context field, kept state only through a shared view or the same address (`payload.keep`), one-shot
  CLI commands exit and `app({ dispose })`, browse/get list server errors, flashes named by path, scaffold / select
  / fill / routes fixes; `part()` shares access rules, layouts are page helpers (recipes).
- 0.23 (ADR 0070): `pathOf` finds the defaults `?` after an optional segment (canonical, links); route params parsed
  (`bindings.parses['#route:…']`); `aria-current` `true` only for a section above; native posts seal the machine
  snapshot into `__hozu_state` (`seal.ts`, HMAC with `SESSION_SECRET` or a lazy per-process key) and `runForm` starts
  from it; `%merge` lowers `{ ...search, x }`; every access but `anyone` narrows `session`; lock lines diff `assign`;
  remote: per-effect fingerprints (`Fingerprint(effect)` in Go), `x-hozu-call` ids, connection errors name effect and
  URL, named enum types, `hozu gen` id/count notes, collapsed issues; browse: `commandfor` is native, `--js both`
  names differing words.
- 0.24 (ADR 0071): asks judged by the framework (accepted / declined with reasons); `aria-current` only for the address
  shown (`currentOf`), sections via the render's `current(route)` (a guard on the `route` reference, `payload.here` =
  [url, route id]), `aria-current` false omitted; tools: `get --select` combinators, `call` endpoint tags, HZ093 old
  contract format, migrate bullets, browse production-errors note, `hozu gen` untitled-enum note.
- 0.25 (ADR 0072): judged by parity / performance / AI; `c ? a : b` whose branches are one element of one shape
  renders one element (`renderBuild` in runtime-server: `%cond` values, class differences as toggles, a listener pick
  `{ test, a, b }`; the IR keeps both branches); `ui.send(E, p, { keys: ['Mod+k'] })` (keydown / keyup, HZ014,
  `preventDefault`, bare keys on window wait while typing); `current(route, params)` (the `here` reference = the
  page's params, HZ007 for an unknown param); lazy `extras.ts` (dialog, link `aria-current`, shortcuts; `payload.extras`),
  P7 9 199 B; budgets S1 / S2 over `examples/*/browse.json` (`bench/smooth.ts`); browse: covering ancestors fail a click,
  `arrived` (prerendered / loaded, ms), a moved element is no flash, `--select` prints class; modes in context
  (`examples/watchlist` `paused`).
- 0.26 (ADR 0073): `hozu build --target workers | vercel | node` (`commands/target.ts`; `bundleServer` in
  `@hozu/bundle`: one web-only bundle of the app, its resolvers and render.js; Workers `dist/workers` + `wrangler.jsonc`,
  Vercel `.vercel/output` Edge Function, node = Dockerfile; prints what the platform needs; `hozu export` stays the
  static form); `hozu browse --build <dir>` drives the bundle (Workers sessions through its KV); `keys` on controls
  (`a button input select summary textarea`: focus a field, click the rest; `data-hozu-keys` + `aria-keyshortcuts`;
  `keys.js` on pages with keys; HZ014 for `ui.send` keys and for one key on two always-shown controls); `localCookie`
  drops `Secure` only over HTTP on a loopback host (Safari); coverage line and `hozu why` count a shared `on` once;
  browse flash detection compares sibling positions; Arc's blank frame on document loads documented (ADR 0073 D).
- 0.26.2 (ADR 0075): `bundleServer` keeps Node built-ins out and reports `node` chains (`server/db.ts → mysql2 → net,
  tls`); `--target workers | vercel` stops with a `build` error naming them and removes its output on failure;
  plain `hozu build` prints which targets can serve the app (`edgeCheck`); `--target node` lists `remote()` services
  and loopback env values; browse `press` reports focus, covering elements name their dialog.
- 0.26.3 (ADR 0076): versions compare in full (`src/versions.ts`); `hozu migrate` phase `upgrade` raises a patch
  release (no rewrite); a record carries `version` and any other record is removed with a note; `hozu check` fails
  on a CLI / `@hozu/core` mismatch (`versions`); `--target` names kept files and missing `.dockerignore` lines,
  prints `docker build -f` for `--out`, removes every folder a failed build made; browse `press` always reports focus
  with the accessible name and hidden-only keys.
- 0.26.4 (ADR 0077): `hozu check` stops on a CLI / core mismatch before loading (`versionStop`, `config` error, fix by
  state); HZ014 `keys` duplicates scoped per `dialog` (runtime: innermost open modal); migrate `done:` list (`MigrateOutput.done`), removes
  other minors' records, upgrade refreshes the guide; `--target node` image named from `package.json`, absolute paths
  outside cwd, agent files ignored; browse `no control has <key>`, JS-off shortcut wording only for declared keys.
- 0.26.5 (ADR 0078): the mismatch fix names the CLI version (`npx -p @hozu/cli@<v> hozu migrate`); focus notes name
  links / buttons by text; JS-off `no control has`; `shellPath` for every printed `--target` path.
- 0.27 (ADR 0079): `HeadIR.noindex` is a value (computed per request; sitemap / robots.txt skip only literal true;
  migrate 0.26 → 0.27 maps the boolean), a computed head `type` is HZ014; HZ072 compares `longhands()`; HZ076 accepts
  `m-auto` on a `dialog` / popover root; HZ094 `@theme` variable clash across stylesheets (`themeDiagnostics` in
  `cli/commands/kits.ts`); HZ026 colour utilities list the project colours (`CompiledStyles.palette`); `hozu add kit`
  syncs every kit's `tv.ts`; `THIRD_PARTY_NOTICES.md` (root and `@hozu/core`). Browse cannot see keys: a flash in a
  re-keyed list may be a different row (ADR 0079 B, corrects ADR 0078).
- 0.28 (ADR 0082, from trial 0026): scaffold sign-in names `\p{L}` (u flag); runtime-client compiles JSON Schema
  patterns with `u` (fallback); `--target node` merges `.gitignore` into the ignore file, `docker run --env-file
  production.env -v <dir>:/app/<dir>`, flags a localhost `site.url`, required env = no default; HZ016 `onlyOperators`;
  browse full-page screenshots + `scroll`; `add feature --page` notes unused replaced views; recipes (JSON file demo,
  no-JS delete confirm, one-person setting). ADR 0080: the 1.0 gate (agent roles, Mori rebuilt, DevTools trial).
- Pages: `project({ site, pages: [ui.page(route,
  { views, head, assert?, entries? })] })`. `head` is a closed set of fields (title, description, type, image,
  published, noindex) from which `<title>`, meta, canonical, Open Graph and JSON-LD are derived; a declared error of
  the head query answers what `head.failed` maps it to (ADR 0043 D). `assert` is validated, never obeyed (ADR 0008).
- `fn()` implementations used on the client are shipped by source text (one module per feature,
  `/_hozu/f/<feature>-<hash>.js`, ADR 0050 C): they must be
  self-contained (no free variables beyond JS globals) — ADR 0007 D5.
- Query/mutation implementations live in server modules via `resolvers(project, implement => [...])`, bound by
  declaration identity. `project({ session })` declares the identity; public resolvers never see it (ADR 0005).
- Minimal comments. Small modules organized by functionality.

## Commands
- `pnpm gate` — lint + typecheck + test + bench; must be green at the end of every phase (ADR 0001)
- `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm bench`
- `pnpm bench:frameworks` — React/Vue/Preact/Svelte comparison (docs/benchmarks); not part of the gate
- `pnpm bench:scale [sizes…]` — generated 50/200/500-feature apps (docs/benchmarks/0003); gates P12; not part of the gate
- `pnpm bench:parity` — screenshot parity of `examples/showcase` against a Nuxt reference (docs/benchmarks/0002)
- `pnpm schema` — regenerate the JSON Schemas from the IR / CLI types (a test fails if stale)
- `pnpm --filter example-cart check|inspect|why|plan|simulate|demo|client|serve|export`
- `pnpm --filter example-blog check|plan|seo|serve|dev` — SEO audit against adapter-node
- `pnpm --filter example-cart dev` — dev server with CSS hot swap
- `pnpm --filter example-showcase check|serve|dev` — every presentation capability and client component library
- `pnpm --filter example-feed check|plan|serve` — cursor pagination, infinite scroll, `:x+` / `:x?` routes
- `examples/notes` — sessions (sign in/out), user-scoped data, no-JS forms; reference app for `bench/trial/notes`
- `node bench/trial/notes/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the notes trial
- `node bench/trial/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the AI trial app (docs/trials/0003)
- `hozu check --update-lock` — accept behavior changes into `hozu.lock.json`; list the accepted `now:` lines

## CLI (agent-facing, all support --json)
`hozu inspect <feature>` · `hozu check [--no-types]` · `hozu why <feature>.<symbol|state> | <node> | page:<route>`
`hozu plan <route|path>` · `hozu call <feature>.<effect|endpoint>` · `hozu browse <path> --do <step>`

## Cost rules
- Do not add CI workflows, scheduled jobs, or any paid/external service without explicit approval.
- Run `pnpm bench` / `pnpm gate` once at the end of a phase; report unstable metrics instead of re-running them.

## Workflow rules
- Work phase by phase. Do not start the next phase without my approval.
- Before each phase, write `docs/adr/NNNN-*.md` with options, trade-offs, and your decision.
- Every phase ends with passing tests and a runnable example in `examples/`.
- A new diagnostic code needs a registry entry, a rule, a fix, and a mistake-catalog case.
- Every deciding transition must be covered by a contract (HZ016); change behavior only together with a
  contract or an accepted lock diff (HZ018). Never edit a contract just to match observed behavior without deciding intent.
- If a principle blocks a practical need, stop and raise it. Do not quietly bend it.
