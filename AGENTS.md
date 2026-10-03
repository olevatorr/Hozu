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
     `freshness: 'static' | 'request' | { revalidate } | { swr } | 'live'`
   - compiler derives a per-node render plan (static / ISR / SWR / per-request / streamed SSR / client);
     `'request'` is a per-request region in either scope
   - `scope: 'user'` data must never reach a cacheable region (hard error) and is never cached across requests:
     its freshness is `'request'` or `'live'` (HZ049, ADR 0043 A)
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
- Release (ADR 0025): npm scope `@hozu/*`, plus unscoped `create-hozu`; the binary is `hozu`. Publishing is manual with the owner's 2FA code: `pnpm -r pack` rehearsal first, no CI.
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
  (done removes the file), `hozu locate <id|pointer|page:route>`, `hozu docs requests`. Dev endpoints answer
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
- `pnpm --filter example-cart check|inspect|explain|plan|simulate|demo|client|serve|export`
- `pnpm --filter example-blog check|plan|seo|serve|dev` — SEO audit against adapter-node
- `pnpm --filter example-cart dev` — dev server with CSS hot swap
- `pnpm --filter example-showcase check|serve|dev` — every presentation capability and client component library
- `pnpm --filter example-feed check|plan|serve` — cursor pagination, infinite scroll, `:x+` / `:x?` routes
- `examples/notes` — sessions (sign in/out), user-scoped data, no-JS forms; reference app for `bench/trial/notes`
- `node bench/trial/notes/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the notes trial
- `node bench/trial/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the AI trial app (docs/trials/0003)
- `hozu check --update-lock` — accept behavior changes into `hozu.lock.json`; list the accepted `now:` lines

## CLI (agent-facing, all support --json)
`hozu inspect <feature>` · `hozu check [--no-types]` · `hozu impact <feature>.<symbol>`
`hozu plan <route>` · `hozu explain <feature>.<state>`

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
