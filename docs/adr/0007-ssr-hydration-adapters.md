# ADR 0007 — Streaming SSR, payload, partial hydration, adapters

- Status: accepted
- Phase: 4

## Context
Render plans exist (ADR 0006). Phase 4 turns them into HTML on the server, hydrates only machine-bound nodes on
the client, never refetches server data on the client (principle 9), and ships two adapters: Node (with an ISR
cache and tag revalidation) and static export. Budgets: `runtime-client` ≤ 5 KB, 0 bytes of JS for machine-less
pages, 0 client fetches after hydration.

## D1 — Streaming order
Options: (a) buffer the whole page, (b) out-of-order streaming (placeholders plus inline swap scripts),
(c) in-order streaming. **Chosen: (c).** `renderPage` is an async generator. The adapter flushes every chunk,
so the static shell before the first `request` region reaches the browser before any per-request data is
fetched. (b) needs an inline script, which would break "0 JS for machine-less pages". Out-of-order streaming can
be added later as a derived optimisation for pages that already ship JS.

## D2 — Islands and hydration
- The server wraps every island instance in `<t-i data-i="n" style="display:contents">`. There is one
  wrapper per instance, so an island inside an `each` gets one per item.
- The payload records, for each instance, its IR node id, its feature, and the serialized **scope** (the
  `each` / `query` bindings it closes over). The island's node IR and the machine IR of every hydrating feature
  ship too, and nothing else of the IR does.
- The client renders each island subtree from IR plus scope, replaces the wrapper's content, and never visits
  static nodes. All islands of a feature share one machine instance.
- Replace-hydration (render then swap) instead of DOM-walking reconciliation: simpler, and the output is
  identical because server and client render the same IR from the same data. Mismatches are impossible by
  construction, except through `fn` impurity.

## D3 — Reactive regions (extends the ADR 0006 plan)
A query region is **reactive** when some mutation invoked by a machine on the page invalidates one of its
tags. Reactive regions are islands. Their data ships in the payload, and a mutation response carries fresh
results for them (`refreshed`). The client updates regions from server-pushed data and never fetches. This
removes the Phase 3 "stale list after mutation" limitation without violating principle 9.

## D4 — Payload
`<script type="application/json" id="tenon-payload">` holding `{ islands, data, features, nodes, fns }`, with
`<` escaped. It is emitted only when `plan.js`; machine-less pages have no script tags at all. `data` holds only
query results that islands render.

## D5 — `fn` on the client
Islands and machines may call `fn()`. Options: (a) bundle the feature modules for the browser (drags in
builders and the schema library), (b) forbid `fn` in islands, (c) emit each used implementation's source
(`impl.toString()`) into a generated module `/_tenon/fns.js`, loaded with `import()`. **Chosen: (c).**
Consequence, raised here rather than hidden: an `fn` used on the client must be self-contained (no free
variables beyond JS globals). The contract runner already requires it to be pure. Enforcing self-containment
statically is future work.

## D6 — Adapters
- `@tenon/runtime-server`: `renderPage({ build, data, route, session })` → `AsyncIterable<string>`;
  `renderIsland` and escaping are shared with the static adapter.
- `@tenon/adapter-node` (`node:http`, zero dependencies): it serves pages, `POST /_tenon/effect`,
  `/_tenon/client.js` and `/_tenon/fns.js`.
  - Cacheable pages (no `request` regions) go through a page-level ISR cache. The TTL is the shortest
    `isr` / `swr` interval (`static` never expires). An expired page is served stale while it regenerates in
    the background. Pages are indexed by the tag keys of the queries they rendered, and a successful mutation
    evaluates `invalidates`, drops every matching page, and forces a blocking regeneration on the next request.
  - Other pages are streamed per request.
  - The session comes from an explicit `session(request)` option.
- `@tenon/adapter-static`: renders every cacheable page at build time and writes `index.html` plus the
  client assets. Pages with `request` regions are skipped and reported with the reason, never silently.
- `runtime-client` ships a prebuilt browser bundle (`dist/browser.js`, esbuild at package build time only).
  P7 is measured on that file.

## Consequences
- The client performs exactly one kind of network call: `POST /_tenon/effect` for machine `invoke`s. It never
  performs a query fetch; a test asserts that nothing is fetched after hydration.
- `esbuild` is a build-time dev dependency; no runtime package depends on it.
