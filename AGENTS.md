# Hozu — AI-first frontend framework

Agents without skill support: before writing Hozu code, read `.claude/skills/hozu/SKILL.md` (the `hozu` skill below).

## North star
Make invalid AI-generated programs structurally difficult to express,
and make valid programs cheap to verify.

Pipeline: `feature() source → Feature IR → validator → compiler → runtime`.
The IR is the source of truth. TS source is a typed authoring surface over it.

## Non-negotiable principles
1. One canonical form per concept. No syntax sugar, no aliases. Formatter normalizes.
2. Explicit over implicit. No auto-imports, no global injection, no file-based magic.
3. No stringly-typed cross references where a declaration identity is possible.
4. Closed world: views are constrained `ui()` trees, never arbitrary functions.
   Side effects only via declared `query` / `mutation`, plus the framework-owned
   `navigate` (on a transition) and `after(ms)` (on a state). Logic is data: `op.*` for
   assigns/guards; anything else is a named, schema-typed `fn()` (ADR 0002 D1).
5. Every behavior change requires a reviewed change: a contract (given / when / expect) for transitions that decide
   (a guard, `navigate`, a `fn` value); the readable lock entry for transitions that only copy values (ADR 0037).
6. Feature boundaries are enforced: features import only other features' public contracts (`exports`).
7. Diagnostics are structured JSON with location, cause, and suggested fix.
8. Rendering mode is DERIVED, never chosen:
   - query declares `scope: 'public' | 'user'` and
     `freshness: 'static' | { revalidate } | { swr } | 'live'`
   - compiler derives a per-node render plan (static / ISR / SWR / streamed SSR / client)
   - `scope: 'user'` data must never reach a cacheable region (hard error)
   - only nodes bound to a machine hydrate; everything else ships 0 JS
   - `render: 'static'` style assertions are allowed but validated, never obeyed blindly
9. Framework-owned fetch: queries have tags, mutations declare `invalidates`.
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
  `@hozu/content` (Markdown collections, ADR 0020), `@hozu/testing` (render assertions, ADR 0021)
- Every `@hozu/*` package except `@hozu/schema-zod`, `@hozu/css` (Tailwind), `@hozu/bundle` (esbuild),
  `@hozu/image` (sharp) and `@hozu/content` (marked, yaml) has zero third-party runtime dependencies.
- Views: every HTML/SVG element with per-tag typed attributes, all DOM events, `ui.dom.*` event fields (HZ027),
  `class` (static) + `toggle` (guarded class groups) + `vars` (CSS custom properties). No `style`, no free
  functions. Stylesheets: `project({ styles })` Tailwind entry + `feature({ styles })`; classes must produce CSS
  (HZ026), hooks use `data-*`. `when`/`ui.if`/`ui.each` take an optional motion name (enter/leave/move classes).
  Also `ui.if`, `ui.link(route, params)`, `ui.window`/`ui.document`, `ui.html` (HZ030 for untrusted values),
  `ui.asset(url)` (HZ028 for img without dimensions).
  Literals are checked against their schema (HZ031); enumerated attributes (`type`, `method`, `loading`…) are typed.
  Internal links are `ui.link` only: a string `href` starting with `/` is HZ032 (ADR 0012).
- Agent guide: the `hozu` skill (`.claude/skills/hozu/`: `SKILL.md` core API ≤ 10 KB, `reference.md` for
  everything beyond the core, `changing.md`, `patterns.md`, `diagnostics.md`, and `example/` = a generated copy of
  `examples/bookmarks`) is the authoring reference; it ships in `create-hozu` and is written into apps by
  `create-hozu --agent claude|agents|both` and `hozu skill`. `pnpm skill` regenerates `example/` and `AGENTS.md`
  (from this file); a test fails when they are stale; `examples/bookmarks` is its verified reference app. Keep both in sync with any API change. Busy states declare `ignore: [Event]` (HZ005, HZ034);
  `ui.dom.value` / `ui.dom.form(name)` may feed enum fields only from literal `<select>`/radio options (HZ033) (ADR 0013).
- Widgets (ADR 0009): `ui.widget({ tag, props, events, client, load, wraps })` in the feature's `declarations`,
  `ui.use(W, { props, on, class }, children)`, client module `export default implement<typeof W>(setup)` from
  `@hozu/core/widget` (type-only import of the declaration). Bundled by `@hozu/bundle` (esbuild), HZ029.
- Server capabilities (ADR 0010): client fetch of new query keys, live queries over SSE, `head.redirects`,
  `sessionCookie` + `setSession`, `project({ notFound })`, `site.icon` / `themeColor`, uploads via `ctx.file`.
- Routes: `route({ path: '/posts/:slug', params: schema | null, search: schema | null })` (search: flat scalars with
  defaults, HZ035; canonical URLs, ISR keyed by canonical URL); `ui.link(route, params, search?)` is the only internal
  URL form, also for `navigate: (arg) => ui.link(...)` on transitions (contracts expect `{ navigate: url }`).
  Forms whose submit reads only `ui.dom.form(name)`/context/params/search also work without JS: the server runs the
  machine for a native post (HZ036 warns otherwise). `project({ notFound, error })`; adapter-node sends CSP (script
  hashes), nosniff and rejects cross-site POSTs; `createServer({ onError, csp })` (ADR 0014).
- Soft navigation (ADR 0015): a view with an island that is listed on both pages and never reads `params`/`search`
  keeps its DOM and machine across a link (derived, `hozu plan` shows it; Navigation API, lazy `navigate.js`
  chunk, budget P8). Pages without such views keep document navigation + prerender.
- HTTP (ADR 0016): the server is `createHandler(options).fetch(Request): Response` in `@hozu/runtime-server`
  (no `node:*` in the runtime import graph; `@hozu/adapter-node` is a bridge + `publicDir`). `project({ http })`:
  `basePath`, `trailingSlash` (308 to the canonical form), `redirects` keyed by path (HZ037), per-route `headers`
  (HZ038, HZ039); no rewrites. `hozu build` writes `dist/public` + `dist/manifest.json`, and
  `buildProject(project, { manifest })` needs no file system (edge; `examples/cart/edge.ts`, checked in a web-only
  vm and on Bun). Budget P9 (req/s through adapter-node) is report-only.
- i18n (ADR 0017): `site.locales` prefixes every URL with its locale (`/`, locale-less page URLs negotiate by
  Accept-Language); `ui.messages(base, {...})` in the feature's `declarations`, `ui.format.*` (Intl),
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
  `feature({ id, intent, declarations, imports?, exports?, styles? })` sorts declarations by their brand (a second
  machine is HZ013, a non-declaration HZ014); `exports` is a flat list. Contracts: `given.context` defaults to
  `initialContext`, `expect.changes` is a deep patch (unmentioned fields must stay equal, arrays replace),
  `expect.effects` defaults to none. The IR is unchanged. Recommended feature layout: `model.ts` + `views.ts`.
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
  `hozu check` hints TS errors on references and warns on truthiness (HZ044, token scanner in `@hozu/validator`) and
  on an incomplete `serve.ts` (HZ045); `hozu add widget`; `endpoint({ method, path, input, output })` declarations
  implemented in resolvers (HZ046, JSON or `'response'`, `setSession`).
- Pages: `project({ site, pages: [ui.page(route,
  { views, head, assert?, entries? })] })`. `head` is a closed set of fields (title, description, type, image,
  published, noindex) from which `<title>`, meta, canonical, Open Graph and JSON-LD are derived; a failing head
  query derives the HTTP status. `assert` is validated, never obeyed (ADR 0008).
- `fn()` implementations used on the client are shipped by source text (`/_hozu/fns.js`): they must be
  self-contained (no free variables beyond JS globals) — ADR 0007 D5.
- Query/mutation implementations live in server modules via `resolvers(project, implement => [...])`, bound by
  declaration identity. `project({ session })` declares the identity; public resolvers never see it (ADR 0005).
- Minimal comments. Small modules organized by functionality.

## Commands
- `pnpm gate` — lint + typecheck + test + bench; must be green at the end of every phase (ADR 0001)
- `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm bench`
- `pnpm bench:frameworks` — React/Vue/Preact/Svelte comparison (docs/benchmarks); not part of the gate
- `pnpm bench:parity` — screenshot parity of `examples/showcase` against a Nuxt reference (docs/benchmarks/0002)
- `pnpm schema` — regenerate the JSON Schemas from the IR / CLI types (a test fails if stale)
- `pnpm --filter example-cart validate|inspect|graph|explain|plan|simulate|demo|client|serve|export`
- `pnpm --filter example-blog validate|plan|seo|serve|dev` — SEO audit against adapter-node
- `pnpm --filter example-cart dev` — dev server with CSS hot swap
- `pnpm --filter example-showcase validate|serve|dev` — every presentation capability and widget library
- `pnpm --filter example-feed validate|plan|serve` — cursor pagination, infinite scroll, `:x+` / `:x?` routes
- `examples/notes` — sessions (sign in/out), user-scoped data, no-JS forms; reference app for `bench/trial/notes`
- `node bench/trial/notes/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the notes trial
- `node bench/trial/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the AI trial app (docs/trials/0003)
- `hozu validate --update-lock` — accept behavior changes into `hozu.lock.json` (only when clean)

## CLI (agent-facing, all support --json)
`hozu inspect <feature>` · `hozu validate [feature]` · `hozu impact <feature>.<symbol>`
`hozu graph <feature>` · `hozu plan <route>` · `hozu explain <feature>.<state>`

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
