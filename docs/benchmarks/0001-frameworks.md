# Benchmark 0001 — rendering vs React, Vue, Preact, Svelte

Run with `pnpm bench:frameworks` (not part of `pnpm gate`). Source: `bench/frameworks`.

## Scenario
The same page in every framework: `<h1>`, a list of 100 products (name, price, an **Add** button each), and a
"Cart: N items" counter. Each framework uses idiomatic state: React/Preact `useState`, Vue `ref`, Svelte `$state`,
and Tenon a machine with `op.inc`. Server data goes to the client the way each framework normally does it: a JSON
props script, or Tenon's payload.

- **SSR renders/s**: Node 22, warm, median of 5 × 500 ms rounds, full HTML document.
- **JS**: the client entry bundled by esbuild (minified, browser, production), then gzipped.
- **Hydrate / interactive**: headless Chromium 140 (Playwright), 4× CPU throttling, median of 10 cold loads.
  "Hydrate" is the framework's own hydration work; "interactive at" is ms since navigation start. React is
  measured at commit (`useEffect`), because `hydrateRoot` returns before it finishes.
- **200 clicks**: click the first Add button 200 times, letting each framework flush (microtasks), then verify
  the counter text.

## Results (2026-09-25, shared 4-vCPU Linux container, single run per framework)
| Framework | SSR renders/s | HTML raw (gzip) | JS min (gzip) | Hydrate ms | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 | 1,155 | 13.4 KB (1.6) | 218.1 KB (67.7) | 98.2 | 356.3 | 254.9 |
| Vue 3.5.43 | 5,080 | 12.6 KB (1.5) | 77.1 KB (30.9) | 31.6 | 87.8 | 151.8 |
| Preact 10.29.8 | 8,751 | 12.6 KB (1.5) | 12.9 KB (5.4) | 26.1 | 111.0 | 334.0 |
| Svelte 5.57.1 | 42,109 | 12.6 KB (1.6) | 49.5 KB (18.7) | 16.7 | 96.2 | 26.8 |
| **Tenon** | 10,905 | 32.8 KB (2.1) | **9.7 KB (4.1)** | **14.4** | **58.3** | **15.8** |

Every framework moved by up to ±20% between runs on this machine (Svelte 50.6k → 42.1k, interactive-at numbers
swing the most), so only differences well beyond that are meaningful.

## Reading the numbers
- **Where Tenon wins**: the smallest client JS; the least hydration work (only machine-bound nodes are
  touched); the fastest updates (one updater per binding, no diffing).
- **SSR**: 2× Vue, 9× React, on par with Preact, ~4× slower than Svelte. Views are compiled once per route plan
  into closures with static strings pre-joined; what remains per request is binding lookups, escaping, and the
  payload `JSON.stringify` (the largest single cost). Svelte's lead comes from ahead-of-time code generation.
- **HTML size**: 2.6× larger raw (1.3× gzipped). The costs are one `<t-i>` wrapper and a payload entry per island
  instance (100 Add buttons are 100 islands), plus `data-t` ids and region comments. Keyed per-list islands or
  shorter ids would reduce it.
- **Interactive at**: first in this run, but within noise of Vue and Svelte. It includes parsing the payload and
  compiling the machine on the client.
- **Astro: not measured.** It needs the full Astro/Vite build pipeline. Astro ships 0 JS for static parts, like
  Tenon; its interactive islands are written in one of the frameworks above, so its client-side cost for this page
  is bounded by those rows plus Astro's island loader.

## History
The first run of this benchmark exposed two defects, fixed in the same change:
- SSR ran at 228 renders/s: an async generator per node, and the plan was re-derived per request. It now
  renders synchronous subtrees to strings, flushes only at query boundaries, and memoizes plans.
- HTML was 502 KB: every island serialized every enclosing binding, including the whole product list, which is
  O(n²). Island scope now keeps only the binding depths the island reads.

Second optimization pass (same day):
- SSR 5,033 → 10,905 renders/s: each view node is compiled once per route plan into a closure (`compile.ts`), with
  adjacent static markup merged into one string; `escapeHtml` and `scriptJson` skip the regex replace when there
  is nothing to escape.
- HTML 35.8 → 32.8 KB (2.7 → 2.1 KB gzipped): island scope is pruned by **path**, not only by depth. An Add button
  that reads `p.sku` ships `{ sku }`, not the whole product. The projection shape is memoized per island node.
