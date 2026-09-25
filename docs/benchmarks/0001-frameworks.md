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

## Results (2026-09-25, shared 4-vCPU Linux container, single run: ±15% noise)
| Framework | SSR renders/s | HTML raw (gzip) | JS min (gzip) | Hydrate ms | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 | 1,141 | 13.4 KB (1.6) | 218.1 KB (67.7) | 83.8 | 283.1 | 247.0 |
| Vue 3.5.43 | 5,411 | 12.6 KB (1.5) | 77.1 KB (30.9) | 29.4 | 115.7 | 155.4 |
| Preact 10.29.8 | 11,267 | 12.6 KB (1.5) | 12.9 KB (5.4) | 22.7 | 101.9 | 321.1 |
| Svelte 5.57.1 | 50,583 | 12.6 KB (1.6) | 49.5 KB (18.7) | 17.1 | 65.0 | 26.3 |
| **Tenon** | 5,033 | 35.8 KB (2.7) | **9.7 KB (4.1)** | **15.6** | 89.9 | **15.0** |

## Reading the numbers
- **Where Tenon wins**: the smallest client JS; the least hydration work (only machine-bound nodes are
  touched); the fastest updates (one updater per binding, no diffing).
- **SSR**: on par with Vue, 4.4× React, but 2.2× slower than Preact and 10× slower than Svelte, whose compiler
  emits string concatenation. Tenon still interprets the IR per request. Compiling views to render functions is the
  obvious next step.
- **HTML size**: 2.7× larger raw (1.8× gzipped). The costs are one `<t-i>` wrapper and a payload entry per island
  instance (100 Add buttons are 100 islands), plus `data-t` ids and region comments. Keyed per-list islands or
  shorter ids would reduce it.
- **Interactive at**: second behind Svelte. It includes parsing the payload and compiling the machine on the
  client.
- **Astro: not measured.** It needs the full Astro/Vite build pipeline. Astro ships 0 JS for static parts, like
  Tenon; its interactive islands are written in one of the frameworks above, so its client-side cost for this page
  is bounded by those rows plus Astro's island loader.

## History
The first run of this benchmark exposed two defects, fixed in the same change:
- SSR ran at 228 renders/s: an async generator per node, and the plan was re-derived per request. It now
  renders synchronous subtrees to strings, flushes only at query boundaries, and memoizes plans.
- HTML was 502 KB: every island serialized every enclosing binding, including the whole product list, which is
  O(n²). Island scope now keeps only the binding depths the island reads.
