# Benchmark 0001 — rendering vs React, Vue, Preact, Svelte

**What this compares:** the UI libraries alone, each with its own server renderer and hydration
(`react-dom/server` + `hydrateRoot`, `@vue/server-renderer` + `createSSRApp`, `preact-render-to-string`,
`svelte/server`). It is **not** Next.js, Nuxt or SvelteKit: no router, no meta-framework server. The comparison with
Next.js and Nuxt in their production servers is `bench/meta`.

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

Third run (after ADR 0009 / 0010, same day). JS is now measured as the entry plus its statically imported chunks,
because Tenon loads motion, widget, live and upload code only on pages that use them:

| Framework | SSR renders/s | HTML raw (gzip) | JS min (gzip) | Hydrate ms | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 | 1,179 | 13.4 KB (1.6) | 218.1 KB (67.7) | 115.3 | 297.8 | 249.1 |
| Vue 3.5.43 | 5,328 | 12.6 KB (1.5) | 77.1 KB (30.9) | 33.0 | 104.2 | 133.3 |
| Preact 10.29.8 | 10,209 | 12.6 KB (1.5) | 12.9 KB (5.4) | 22.2 | 93.6 | 304.9 |
| Svelte 5.57.1 | 54,388 | 12.6 KB (1.6) | 49.5 KB (18.7) | 17.3 | 70.2 | 25.2 |
| **Tenon** | **13,702** | 18.6 KB (1.8) | 17.0 KB (7.1) | 15.0 | 103.0 | **16.0** |

- SSR went from 10.9k to 13.7k renders/s, and HTML from 32.8 to 18.6 KB: no `data-t` ids and no `<t-i>` wrappers.
  Hydration now adopts the server DOM through comment markers.
- Initial JS grew from 4.1 to 7.1 KB gzipped. The runtime now covers the full DOM vocabulary, keyed moves,
  `if`/`html`/`window` nodes and client query fetching. It is still the second smallest after Preact.
- "Interactive at" moved from 58 to 103 ms. This metric swings the most between runs (Svelte went from 96 to 70).

## Fourth run: after Phase 9 (2026-09-26, local macOS, system Chrome)
This run used a different machine than the earlier runs, so compare the ranking, not the absolute numbers.

| Framework | SSR renders/s | HTML (gz) | JS min (gz) | Hydrate ms (4× CPU) | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 | 2,337 | 13.4 KB (1.6) | 218.1 KB (67.7) | 35.1 | 126.2 | 79.6 |
| Vue 3.5.43 | 12,563 | 12.6 KB (1.5) | 77.1 KB (30.9) | 12.1 | 33.4 | 42.7 |
| Preact 10.29.8 | 22,678 | 12.6 KB (1.5) | 12.9 KB (5.4) | 7.6 | 26.0 | 86.6 |
| Svelte 5.57.1 | 92,570 | 12.6 KB (1.6) | 49.5 KB (18.7) | 7.2 | 31.6 | 9.1 |
| **Tenon** | 21,959 | 18.7 KB (1.8) | 18.5 KB (7.7) | 7.3 | 61.2 | 10.5 |

- **Initial JS** (7.7 KB gzipped) is still second after Preact, and less than half of Svelte. Phases 7–9 added
  0.6 KB.
- **Hydration** (7.3 ms) and **200 clicks** (10.5 ms) are second, next to Svelte.
- **SSR** is third, close to Preact.
- **"Interactive at"** is second to last. This metric swung the most in earlier runs, too.
- **Parity** (`pnpm bench:parity`, same day): 24/24 identical against the Nuxt reference.

## Fifth run: after ADR 0023 (2026-09-26, same machine as the fourth run)
| Framework | SSR renders/s | HTML (gz) | JS min (gz) | Hydrate ms (4× CPU) | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 | 2,427 | 13.4 KB (1.6) | 218.1 KB (67.7) | 62.4 | 123.7 | 79.6 |
| Vue 3.5.43 | 12,728 | 12.6 KB (1.5) | 77.1 KB (30.9) | 12.5 | 33.8 | 42.5 |
| Preact 10.29.8 | 21,973 | 12.6 KB (1.5) | 12.9 KB (5.4) | 7.9 | 27.3 | 86.0 |
| Svelte 5.57.1 | 94,615 | 12.6 KB (1.6) | 49.5 KB (18.7) | 7.0 | 30.9 | 9.4 |
| **Tenon** | 35,259 | **12.1 KB** (1.8) | 18.0 KB (7.5) | 7.4 | **27.4** | 10.3 |

**The harness was corrected in this run.** Until the fourth run, the Tenon row did not measure what production
serves:
- It bundled the client from the package index without defining `__TENON_DEV__`. The index re-exports `motion`, so
  the bundle had a static chunk that production does not have. Now the entry has the same module graph as the
  production `browser.ts`, with the same `define`.
- The initial-JS count missed side-effect imports (`import"./chunk…"`). It now counts them.
- Old output files are removed before each build.

What the numbers show:
- **Interactive at** is 27.4 ms, down from 61.8 ms with the old harness in the same session. That is level with
  Preact (27.3 ms) and ahead of Svelte.
  - Most of the old gap was the harness's static chunk: one extra round trip on a slowed CPU.
  - Production now also preloads `client.js` and `fns.js` from `<head>`.
- **HTML** is the smallest raw (12.1 KB, from 18.7). Gzipped it is 1.8 KB, against 1.5–1.6 KB for the others:
  - most of the difference is the head Tenon derives (speculation rules, JSON-LD, Open Graph), which the other
    benchmark pages do not have;
  - without that head, at maximum compression, the page is 1.53 KB, against 1.43 KB for Vue.
- **SSR** is 35.3 k renders/s, from 22.0 k. It is second after Svelte, which stays 2.7× ahead.
- **Initial JS** is 7.5 KB gzipped (the production bundle), still second after Preact.

## Sixth run: after ADR 0024 (2026-09-26, same machine)
| Framework | SSR renders/s | HTML (gz) | JS min (gz) | Hydrate ms (4× CPU) | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 | 2,533 | 13.4 KB (1.6) | 218.1 KB (67.7) | 62.5 | 123.7 | 80.1 |
| Vue 3.5.43 | 12,409 | 12.6 KB (1.5) | 77.1 KB (30.9) | 12.4 | 34.0 | 42.4 |
| Preact 10.29.8 | 22,416 | 12.6 KB (1.5) | 12.9 KB (5.4) | 7.8 | 26.7 | 84.8 |
| Svelte 5.57.1 | 94,194 | 12.6 KB (1.6) | 49.5 KB (18.7) | 7.0 | 30.4 | 8.7 |
| **Tenon** | **52,617** | 12.1 KB (1.8) | 18.0 KB (7.5) | 7.4 | 27.8 | 10.6 |

Server HTML now comes from generated JavaScript source (ADR 0024).
- **SSR** rose from 35.3 k to 52.6 k renders/s. That is second, 2.3× Preact, with Svelte 1.8× ahead.
- The other columns are unchanged, as expected: the generator is server-only and the HTML is byte-identical.
- **Interactive at** (27.8 ms) is within 1.1 ms of Preact, the fastest this run. It stays ahead of Svelte.

## Seventh run: 0.15, after the fn module fix (2026-10-04, Apple M4 Pro, system Chrome)
| Framework | SSR renders/s | HTML (gz) | JS min (gz) | Hydrate ms (4× CPU) | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 (react-dom, no Next.js) | 2,697 | 13.4 KB (1.6) | 218.1 KB (67.7) | 63.5 | 124.0 | 85.9 |
| Vue 3.5.43 (no Nuxt) | 13,609 | 12.6 KB (1.5) | 77.1 KB (30.9) | 12.8 | 33.3 | 45.2 |
| Preact 10.29.8 | 24,046 | 12.6 KB (1.5) | 12.9 KB (5.4) | 8.4 | 26.4 | 82.6 |
| Svelte 5.57.1 (no SvelteKit) | 96,566 | 12.6 KB (1.6) | 49.5 KB (18.7) | 6.9 | 30.4 | 9.0 |
| **Hozu 0.15.0** | 48,377 | 12.4 KB (1.8) | 19.2 KB (8.0) | 7.3 | 28.4 | 11.0 |

- **Between the sixth run and this one, the bench was broken** (ADR 0056 A14): from 0.8 the Hozu row ran without the
  transform, and from 0.12 it did not serve the fn modules. Repaired in 0.15, it showed interactive at 59–61 ms; the
  cause was `import()` of the fn module during hydration (ADR 0056 A14). With the fix, hydrate is 7.3 ms and
  interactive 28.4 ms, as in the sixth run.
- **SSR** 48.4 k renders/s against 52.6 k in the sixth run, on a different machine. Against Svelte in the same run
  it is 0.50× (0.56× then). See "SSR since the sixth run" below. A first run of this table showed 31.8 k because the repaired bench
  computed the fn module table on every render; it is now computed once, as a server does.
- **JS** is 8.0 KB gzipped (7.5 KB in the sixth run): the fn modules are now counted, and 0.9–0.15 added the
  component runtime and the module registration.
- Single run per framework, on the same machine. `pnpm bench` B2 runs the Hozu row on every gate (budget 50 ms).

### SSR since the sixth run
- **0.14.0 against 0.15.0, the same app, the packed tarballs, interleaved three times on one idle machine:**
  48,228 / 48,486 / 48,570 against 47,884 / 48,315 / 48,049 renders/s. The two releases are within 1 %, so 0.15 did
  not slow rendering.
- **Against the sixth run** (Tenon 0.3 era, 2026-09-26, another machine): the ratio to Svelte fell from 0.56× to
  0.50×. The releases between them added the component markers (0.9), the fn module scripts (0.12) and the
  page-scoped payload (0.12). That drift was not bisected; `pnpm bench` B2 now watches the client side, and the
  server side is reported here.

## Eighth run: 0.16.0 (2026-10-04, Apple M4 Pro, system Chrome)
| Framework | SSR renders/s | HTML (gz) | JS min (gz) | Hydrate ms (4× CPU) | Interactive at ms | 200 clicks ms |
|---|---|---|---|---|---|---|
| React 19.3.0 (react-dom, no Next.js) | 2,781 | 13.4 KB (1.6) | 218.1 KB (67.7) | 34.3 | 121.4 | 81.6 |
| Vue 3.5.43 (no Nuxt) | 13,557 | 12.6 KB (1.5) | 77.1 KB (30.9) | 12.4 | 34.7 | 45.5 |
| Preact 10.29.8 | 24,350 | 12.6 KB (1.5) | 12.9 KB (5.4) | 8.4 | 26.6 | 82.0 |
| Svelte 5.57.1 (no SvelteKit) | 98,574 | 12.6 KB (1.6) | 49.5 KB (18.7) | 7.4 | 29.6 | 8.6 |
| **Hozu 0.16.0** | 53,995 | 12.4 KB (1.8) | 18.5 KB (7.8) | 6.9 | 28.2 | 11.4 |

- **SSR** 54.0 k renders/s (48.4 k in the seventh run): the per-IR-object memo of ADR 0057 B3. Against Svelte in the
  same run it is 0.55× (0.50× in the seventh, 0.56× in the sixth). ADR 0057 measured 55.0 k in its bisect; this is
  one run, so read the two as the same level.
- **JS** 7.8 KB gzipped (8.0 KB): component use and the list move animation load with their chunks (ADR 0057 B1).
- Single run per framework, on the same machine as the seventh run.
