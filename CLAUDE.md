# Tenon — AI-first frontend framework

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
5. Every behavior change requires a contract change (behavior `contracts`: given / when / expect).
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
- Node ≥ 22.18: `tenon.config.ts` is loaded with native type stripping, so authored code is
  erasable-syntax TS with explicit `.ts` relative imports
- Schemas: Standard Schema compatible, exactly one adapter per project (`project({ schema })`;
  `@tenon/schema-zod` is the default, Valibot via adapter). The IR stores JSON Schema.
- Packages are published under the @tenon/ scope:
  `@tenon/core` (IR types + builders; tooling at `@tenon/core/ir`), `@tenon/schema-zod`,
  `@tenon/machine` (isomorphic compiled interpreter, ADR 0004), `@tenon/data` (resolvers, cache,
  tags, dedup, ADR 0005), `@tenon/validator`, `@tenon/compiler` (render plans, ADR 0006),
  `@tenon/runtime-server` (in-order streaming SSR + the web-standard handler, ADR 0007/0016), `@tenon/runtime-client` (own fine-grained
  DOM runtime, no VDOM, replace-hydration of islands, ADR 0006/0007),
  `@tenon/cli`, `@tenon/adapter-node` (ISR page cache + tag revalidation), `@tenon/adapter-static`,
  `@tenon/css` (Tailwind v4 bound, compiled from the IR's class candidates, TN026, ADR 0009),
  `@tenon/dev` (dev server: CSS hot swap, reload on code changes), `@tenon/image` (optional WebP srcset, ADR 0017)
- Every `@tenon/*` package except `@tenon/schema-zod`, `@tenon/css` (Tailwind), `@tenon/bundle` (esbuild),
  `@tenon/image` (sharp) and `@tenon/content` (marked, yaml) has zero third-party runtime dependencies.
- Views: every HTML/SVG element with per-tag typed attributes, all DOM events, `ui.dom.*` event fields (TN027),
  `class` (static) + `toggle` (guarded class groups) + `vars` (CSS custom properties). No `style`, no free
  functions. Stylesheets: `project({ styles })` Tailwind entry + `feature({ styles })`; classes must produce CSS
  (TN026), hooks use `data-*`. `when`/`ui.if`/`ui.each` take an optional motion name (enter/leave/move classes).
  Also `ui.if`, `ui.link(route, params)`, `ui.window`/`ui.document`, `ui.html` (TN030 for untrusted values),
  `ui.asset(url)` (TN028 for img without dimensions).
  Literals are checked against their schema (TN031); enumerated attributes (`type`, `method`, `loading`…) are typed.
  Internal links are `ui.link` only: a string `href` starting with `/` is TN032 (ADR 0012).
- Agent guide: the `tenon` skill (`.claude/skills/tenon/`: `SKILL.md` core API, `changing.md`, `patterns.md`,
  `diagnostics.md`) is the authoring reference; `examples/bookmarks` is its verified reference app. Keep both in sync with any API change. Busy states declare `ignore: [Event]` (TN005, TN034);
  `ui.dom.value` / `ui.dom.form(name)` may feed enum fields only from literal `<select>`/radio options (TN033) (ADR 0013).
- Widgets (ADR 0009): `ui.widget({ tag, props, events, client, load, wraps })` in `feature({ widgets })`,
  `ui.use(W, { props, on, class }, children)`, client module `export default implement<typeof W>(setup)` from
  `@tenon/core/widget` (type-only import of the declaration). Bundled by `@tenon/bundle` (esbuild), TN029.
- Server capabilities (ADR 0010): client fetch of new query keys, live queries over SSE, `head.redirects`,
  `sessionCookie` + `setSession`, `project({ notFound })`, `site.icon` / `themeColor`, uploads via `ctx.file`.
- Routes: `route({ path: '/posts/:slug', params: schema | null, search: schema | null })` (search: flat scalars with
  defaults, TN035; canonical URLs, ISR keyed by canonical URL); `ui.link(route, params, search?)` is the only internal
  URL form, also for `navigate: (arg) => ui.link(...)` on transitions (contracts expect `{ navigate: url }`).
  Forms whose submit reads only `ui.dom.form(name)`/context/params/search also work without JS: the server runs the
  machine for a native post (TN036 warns otherwise). `project({ notFound, error })`; adapter-node sends CSP (script
  hashes), nosniff and rejects cross-site POSTs; `createServer({ onError, csp })` (ADR 0014).
- Soft navigation (ADR 0015): a view with an island that is listed on both pages and never reads `params`/`search`
  keeps its DOM and machine across a link (derived, `tenon plan` shows it; Navigation API, lazy `navigate.js`
  chunk, budget P8). Pages without such views keep document navigation + prerender.
- HTTP (ADR 0016): the server is `createHandler(options).fetch(Request): Response` in `@tenon/runtime-server`
  (no `node:*` in the runtime import graph; `@tenon/adapter-node` is a bridge + `publicDir`). `project({ http })`:
  `basePath`, `trailingSlash` (308 to the canonical form), `redirects` keyed by path (TN037), per-route `headers`
  (TN038, TN039); no rewrites. `tenon build` writes `dist/public` + `dist/manifest.json`, and
  `buildProject(project, { manifest })` needs no file system (edge; `examples/cart/edge.ts`, checked in a web-only
  vm and on Bun). Budget P9 (req/s through adapter-node) is report-only.
- i18n (ADR 0017): `site.locales` prefixes every URL with its locale (`/`, locale-less page URLs negotiate by
  Accept-Language); `ui.messages(base, {...})` registered as `feature({ messages })`, `ui.format.*` (Intl),
  `locale` ref, `ui.alternate(l)`; hreflang/og:locale/sitemap derived. Messages and formats are lowered on the server
  for the page locale (islands get only its strings; helpers live in `fns.js`, P7 unchanged). TN040–TN042.
- Images (ADR 0017): optional `@tenon/image` (build-time, sharp) → `optimizeImages(build)` makes WebP widths for raster
  `<img src={ui.asset}>`; the renderer adds `srcset`/`sizes` (IR unchanged). `tenon build` uses it when the project
  can resolve it; otherwise images are served as-is.
- Route grammar (ADR 0018): URLPattern modifiers `:x?` (nullable), `:x+`/`:x*` (string[]), one parser
  (`routePattern` in core) for server, validator and speculation rules; TN024 checks the schema per modifier.
  Load more = machine-held cursors + one `ui.query` per page (pattern, `examples/feed`); framework event `visible`
  (lazy IntersectionObserver chunk, `data-tenon-visible` added at build).
- Phase 8a (ADR 0019): `project({ env: { server, public } })` parsed at startup (`ctx.env` in resolvers, `ui.env(Schema)`
  in views, lowered for islands); every mutation has the framework error `Invalid` `{ message, fields }` (schema
  failures and `fail('Invalid', …)`), optional in `failed`, reserved as a declared name (TN014). Optimistic UI =
  render the in-flight value in the busy state. P7 budget 8 KiB; P2 exponent over 250–2000, 5 interleaved rounds.
- Phase 8b (ADR 0020): `@tenon/css` adds size-adjusted local fallback faces for local font files (metrics from
  head/hhea/OS/2, node:zlib only); `@tenon/content` (marked + yaml, server-side) = Markdown collections returned by
  query resolvers; `@tenon/dev` serves a development client bundle (`globalThis.__TENON_DEV__`) that restores machine
  snapshots across code reloads when the machine IR is unchanged (production bundle strips it).
- Pages: `project({ site, pages: [ui.page(route,
  { views, assert, head, entries })] })`. `head` is a closed set of fields (title, description, type, image,
  published, noindex) from which `<title>`, meta, canonical, Open Graph and JSON-LD are derived; a failing head
  query derives the HTTP status. `assert` is validated, never obeyed (ADR 0008).
- `fn()` implementations used on the client are shipped by source text (`/_tenon/fns.js`): they must be
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
- `node bench/trial/accept.mjs <name> <dir> <entry> <port> [1|2]` — hidden acceptance of the AI trial app (docs/trials/0003)
- `tenon validate --update-lock` — accept behavior changes into `tenon.lock.json` (only when clean)

## CLI (agent-facing, all support --json)
`tenon inspect <feature>` · `tenon validate [feature]` · `tenon impact <feature>.<symbol>`
`tenon graph <feature>` · `tenon plan <route>` · `tenon explain <feature>.<state>`

## Cost rules
- Do not add CI workflows, scheduled jobs, or any paid/external service without explicit approval.
- Run `pnpm bench` / `pnpm gate` once at the end of a phase; report unstable metrics instead of re-running them.

## Workflow rules
- Work phase by phase. Do not start the next phase without my approval.
- Before each phase, write `docs/adr/NNNN-*.md` with options, trade-offs, and your decision.
- Every phase ends with passing tests and a runnable example in `examples/`.
- A new diagnostic code needs a registry entry, a rule, a fix, and a mistake-catalog case.
- Every machine transition must be covered by a contract (TN016); change behavior only together with a
  contract (TN018). Never edit a contract just to match observed behavior without deciding intent.
- If a principle blocks a practical need, stop and raise it. Do not quietly bend it.
