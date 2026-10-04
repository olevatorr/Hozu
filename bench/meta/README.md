# Meta-framework benchmark: Next.js vs Nuxt vs SvelteKit vs Hozu

One page, built with each framework's own production build and served by its own production server, all
measured by one script (`run.mjs`). The scenario is the same as `bench/frameworks`: an `<h1>`, a list of
100 products (`data.ts`, identical copy in every app) with a name, a price and an Add button each, and a
`Cart: N items` counter.

This directory is **not** part of the pnpm workspace. Each app has its own `package.json` and pinned versions.

## Versions (exact)

| Row | Framework | UI library | Server | Build tool |
|---|---|---|---|---|
| Next.js | `next` 16.3.8, App Router | `react` / `react-dom` 19.3.0 | `next start` | Turbopack (Next 16 default) |
| Nuxt | `nuxt` 4.5.2 | `vue` 3.5.43, `vue-router` 4.6.4 | `node .output/server/index.mjs` (Nitro 2.13.4, `node-server` preset, h3 1.15.11) | Vite 8.3.2 |
| SvelteKit | `@sveltejs/kit` 3.0.0 | `svelte` 5.57.1 | `node build/index.js` (`@sveltejs/adapter-node` 6.0.0) | Vite 8.3.2, `@sveltejs/vite-plugin-svelte` 7.3.1 |
| Hozu | `@hozu/*` 0.16.0, workspace build at commit `e0474b4` (branch `release-0.16`) | own runtime (`@hozu/runtime-client`) | `hozu serve` → `@hozu/adapter-node` | prebuilt `client.js` from `@hozu/runtime-client` |

Environment: Node v22.22.2, Google Chrome 154.0.8037.93 (driven by `playwright-core` 1.63.0), Apple M4 Pro,
24 GB, macOS (Darwin 25.5.0, arm64). Every server ran with `NODE_ENV=production`, on 127.0.0.1.

## What each app does

| | Rendering mode (what the server does per request) | How the data reaches the page | Hydration markers |
|---|---|---|---|
| Next.js | `/`: `export const dynamic = 'force-dynamic'`, so a full RSC + SSR render on every request. `/static`: `export const dynamic = 'force-static'`, prerendered at build time and served from disk (reported as its own row) | Server component `page.tsx` imports `products` and passes them as props to **one client component** (`Products.tsx`: `<ul>` + counter, `useState`). The whole list is in the client component because every item has an interactive button that writes the shared counter. The props are serialized into the RSC payload inlined in the HTML. | start: `instrumentation-client.ts` (Next's hook that runs before hydration); end: `useEffect` in `Products` |
| Nuxt | SSR on every request (no `routeRules`, no prerender) | `useFetch('/api/products')` against a Nitro server route (`server/api/products.get.ts`). During SSR this is an in-process call, and the result is serialized into the Nuxt payload in the HTML | start: client plugin with `enforce: 'pre'`; end: `onMounted` in `pages/index.vue` |
| SvelteKit | SSR on every request (prerender off, the default) | `+page.server.js` `load` returns `products`, which are serialized into the page data in the HTML | start: `init` in `hooks.client.js`; end: `onMount` in `+page.svelte` |
| Hozu | `listProducts` declared `scope: 'public'`, `freshness: 'request'`, so the region is rendered on every request (`hozu plan home` prints `cacheable: no`, region `request`) | A `query` resolved by a server resolver (`app.ts`). Its result is serialized into the page payload | No app-level hook exists. In the **timing runs only**, the runner rewrites the last statement of the served `/_hozu/client.js` (`X(document);`) to `start = performance.now(); X(document).then(() => end)`. This matches `bench/frameworks/apps/entries.ts`. Byte counts come from a separate, unmodified load |

Hozu runs as a real Hozu project (`hozu.config.ts`, `app.ts`, `features/shop`, `hozu.lock.json`), checked with
`hozu check` (0 errors, 0 warnings). `node hozu/link.mjs` symlinks the workspace packages
(`packages/*`, built `dist/`) and `zod` into `hozu/node_modules`. `client.js` and the fn module
`/_hozu/f/…js` are served by the handler exactly as in production.

## Method

- **req/s**: `GET /` from a zero-dependency Node client in the runner process: `http.Agent({ keepAlive: true })`,
  16 concurrent connections, 5 s warmup, then 3 × 5 s rounds, median reported. Every response must be 200 with a
  body, or the run fails. Measured twice:
  - **identity**: no `Accept-Encoding` header, so no server compresses.
  - **gzip accepted**: `Accept-Encoding: gzip, deflate, br`. The encoding each server then chose for the HTML is in
    parentheses. Only Next compresses dynamic HTML by default.
- **Load-generator ceiling**: the same client against a plain `node:http` server returning a fixed 12 KB buffer
  (`baseline.mjs`) reaches about 58 000 req/s, so the client does not limit any framework.
- **HTML**: the body of `GET /` (identity), raw bytes and `gzipSync` (zlib default level 6) bytes.
- **JS**: every JavaScript response the browser fetched on a cold first load, up to `networkidle`, hydration
  and 500 ms after that. This includes `<script>`, `modulepreload` and dynamic imports, matched by resource type
  `script` or a `javascript` content-type. Raw is the decoded body. gz is `gzipSync` of each file, summed, so
  every framework is compared on the same compression whatever it served. Inline `<script>` content is part of
  the HTML number, not the JS number.
- **Hydrate ms / Interactive at ms / 200 clicks ms**: Chrome with 4× CPU throttling
  (`Emulation.setCPUThrottlingRate`), a fresh browser context per load (cold cache), median of 10 loads.
  - Hydrate ms is `end − start` of `window.__hydrated`.
  - Interactive at ms is `end`, in ms since navigation start.
  - 200 clicks is `button.click()` on the first Add button 200 times, yielding two microtasks each, then one
    macrotask. The counter text must then read `Cart: 200 items`, or the run fails.
- **Sanity checks** (any failure replaces the numbers with FAILED):
  - the server HTML contains 100 `<li>`
  - the hydrated DOM has 100 `<li>`, 100 Add buttons, `<h1>Products</h1>` and `Cart: 0 items`
  - `Cart: 200 items` after the clicks, on every one of the 10 loads
- Frameworks run one at a time: start the server, run the sanity/bytes load, run the load test, run the browser
  timings, stop the server by PID, then move to the next. Ports 4811–4815.

## Results (2026-10-04, second run: Hozu 0.16 with compression)

All sanity checks passed for every row.

| Framework (exact versions) | Page | req/s (identity) | req/s (gzip accepted) | HTML KB (gz) | JS files | JS KB (gz) | Hydrate ms | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|---|---|---|
| Next.js 16.3.8 (App Router, React 19.3.0, react-dom 19.3.0) | per request (`dynamic = 'force-dynamic'`) | 1701 | 1546 (gzip) | 18.8 (3.1) | 6 | 443.5 (130.9) | 106.8 | 165.7 | 99.7 |
| Next.js 16.3.8 (App Router, React 19.3.0, react-dom 19.3.0) | static prerender (`dynamic = 'force-static'`) | 6952 | 6033 (gzip) | 19.3 (3.1) | 6 | 443.5 (130.9) | 100.5 | 153.7 | 103.1 |
| Nuxt 4.5.2 (Vue 3.5.43, Nitro 2.13.4, node-server preset) | per request (SSR, no route rules) | 3236 | 3229 (identity) | 15.0 (2.8) | 6 | 199.6 (75.8) | 19.6 | 87.4 | 32.3 |
| SvelteKit 3.0.0 (Svelte 5.57.1, adapter-node 6.0.0) | per request (SSR, prerender off) | 6867 | 6828 (identity) | 13.4 (2.0) | 10 | 85.0 (33.0) | 18.8 | 94.2 | 10.5 |
| Hozu 0.16.0 (workspace build @ e0474b4, hozu serve → @hozu/adapter-node) | per request (query `freshness: 'request'`) | 16870 | 10168 (gzip) | 12.3 (1.8) | 2 | 19.3 (8.1) | 6.9 | 54.4 | 10.2 |
| node:http v22.22.2 calibration (fixed 12 KB buffer, no framework) | load-generator ceiling | 59716 | — | — | — | — | — | — | — |

The req/s rounds were stable within about 3 %. Per-load samples are in `out/results.json`.

- **Hozu with gzip accepted:** 10,168 req/s in this run, before 0.16 flushed a compressed page only when the stream
  waits; 11,875 req/s after (a Hozu-only run, `BENCH_ONLY=hozu`). The site uses the second number.
- **The first run** (0.15.0, uncompressed): Hozu 16,423 / Next.js 1,630 / Nuxt 3,058 / SvelteKit 6,786 req/s; the
  ratios are the same.

## Caveats

- **Hydrate ms is not strictly comparable across frameworks.** Each "start" is the earliest user hook the framework
  offers, and those hooks sit at different points:
  - Next: `instrumentation-client`.
  - Nuxt: the first plugin, after `createApp`.
  - SvelteKit: `init`.
  - Hozu: after `client.js` has evaluated.

  **Interactive at** (time since navigation start) has the same meaning for all four and is the number to compare.
- **What is served compressed differs.** By default:
  - Next gzips HTML and JS on the fly.
  - SvelteKit serves precompressed brotli/gzip for its static assets, but not for its HTML.
  - Nuxt (Nitro `node-server`) and `@hozu/adapter-node` send everything uncompressed.

  The gz columns therefore use our own gzip for every framework. Bytes actually transferred on the JS first load
  were: Next 134 376 (gzip), Nuxt 204 411 (identity), SvelteKit 30 559 (brotli), Hozu 19 812 (identity). In
  production a reverse proxy or CDN usually compresses.
- **Next's HTML includes the RSC payload.** About 9.7 K characters of inline `self.__next_f.push(...)` script hold the
  serialized props and the component tree. That is part of the HTML figure.
- **Inline script in the HTML of the others:**
  - Nuxt: about 6.5 K characters (payload).
  - SvelteKit: about 4.7 K (data + boot).
  - Hozu: about 3.2 K (page payload).
- **Extra non-JS requests:**
  - Nuxt fetches `/_nuxt/builds/meta/<id>.json` (app manifest).
  - Hozu fetches its (empty) generated stylesheet.
  - Next and SvelteKit fetched none.
- **Next static row.** `/static` is prerendered at build time. Its req/s is file serving through `next start`, not
  rendering. The other rows render per request. No static variant was built for the other frameworks.
- **Server work differs by design.** Next renders an RSC tree and then HTML. Nuxt runs the Vue SSR renderer plus the
  `useFetch` in-process call. SvelteKit runs `load` plus SSR. Hozu runs generated render code (ADR 0024) plus one query
  resolver. Every server is a single Node process, with no cluster mode for any of them.
- **Hozu's version is the unpublished workspace build of 0.15.0**, not an npm install.
- One unrelated, idle Node process (the site server on port 4401) was running on the machine during the run.
- These numbers come from one machine and one run. Treat differences under about 5 % as noise.

## Reproduce

```sh
export PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH
export CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
(cd bench/meta/next && npm install) && (cd bench/meta/nuxt && npm install) && (cd bench/meta/sveltekit && npm install)
pnpm build                                   # workspace packages, for Hozu
node bench/meta/hozu/link.mjs
node bench/meta/run.mjs --build              # BENCH_ONLY=next,hozu  BENCH_RUNS=10
```

Results are written to `bench/meta/out/results.json` (every sample, every JS file with its encoding) and the
table is printed to stdout.
