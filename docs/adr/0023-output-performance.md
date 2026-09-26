# ADR 0023 — Output performance: script discovery, a compact payload, faster SSR

- Status: proposed
- Motivation: the framework comparison (docs/benchmarks/0001, last run) ranks Tenon second on JS, hydration and
  clicks, but last or near last on three metrics. The user's priority is that the output is smaller and faster,
  with an authoring surface that AI finds easy. This phase changes no authoring API.

| Metric | Tenon | Best | Rank |
|---|---|---|---|
| Interactive at (ms, 4× CPU) | 61.2 | Preact 26.0 | 4 of 5 |
| HTML raw (gzip) | 18.7 KB (1.8) | 12.6 KB (1.5) | 5 of 5 |
| SSR renders/s | 21,959 | Svelte 92,570 | 3 of 5 |

## What the measurements show
Two assumptions from the previous discussion were wrong and are corrected here:
- **SSR already compiles.** It builds a closure tree per view (`runtime-server/src/compile.ts`); it does not walk
  the IR per request.
- **Hydration already claims the server DOM** (`attach(…, claim: true)`). It does not re-render the islands.

**1. Interactive-at is lost before any Tenon code runs.**
- `Hydrate ms` is 7.3, level with Svelte and Preact, but hydration *starts* at about 55 ms, where Svelte starts at
  24 ms.
- The benchmark's own esbuild build splits the Tenon client into `app.js` plus a static chunk. The browser only
  finds the chunk after downloading and parsing `app.js`: one extra round trip on a 4× slowed CPU.
- **Experiment, same harness, 10 runs × 2 rounds:** adding one `<link rel="modulepreload">` for the chunk moves
  interactive-at from **62.0 to 28.7 ms**, ahead of Svelte (31.0 ms).
- **Production has two similar waterfalls that the benchmark does not measure:**
  - `/_tenon/fns.js` is imported only after `client.js` runs (the benchmark stubs `loadFns`);
  - the `client.js` script tag is written at the end of the streamed body, so on a page with slow queries it is
    discovered only when the last query finishes.

**2. The HTML is large because of how island references are written.**
- The page has 101 islands, one per item button. Each is written as
  `{"feature":"shop","node":"shop.Page/1/ready/0/item/3","scope":[null,{"sku":"sku-0"}]}`: 9.5 KB of the 19.2 KB
  page.
- Only `scope` differs between entries. The feature is the node id's prefix, and the node id repeats.

**3. Half of SSR time is serialising that payload.**
- A CPU profile of `bench/frameworks/ssr-only.ts` puts **50.6%** of samples in `scriptJson` (`JSON.stringify` of
  the payload).
- The compiled closures of `compile.ts` take about 25%, garbage collection 4%, and `pruneScope` 2%.

## Decision 1 — Scripts are discovered from `<head>`
| Option | Trade-off |
|---|---|
| a. Leave it | Production waits for the whole body before fetching the client, then waits again for `fns.js` |
| b. Move the client script into `<head>` | Executes before the islands are streamed; the runtime would need to wait for them |
| **c. `<link rel="modulepreload">` in `<head>` for every script the page will run** | Fetching starts with the first bytes; execution order is unchanged |

**Decision (c).** The render plan already knows, per route, whether the page has islands, binds `fn`s, uses
widgets or soft navigation. `<head>` gets a modulepreload for:
- `client.js`;
- `fns.js` when the page binds fns;
- `navigate.js` when soft navigation applies.

It is derived, not authored (principle 8). The CSP is unaffected: preloads are not scripts.

The benchmark is corrected in the same step. The Tenon row loads the production client bundle, including its real
`fns.js` loading, and the page exactly as `renderToString` writes it. The benchmark then measures what users get,
waterfalls included.

## Decision 2 — A compact payload
| Option | Trade-off |
|---|---|
| a. Compress with a generic encoder | Hides the redundancy from gzip only; parse and stringify costs stay |
| b. One island per machine view, events delegated from its root | Fewest islands, but a runtime rewrite and a new event model; not needed for the targets |
| **c. Group island references by node: `islands: { [node]: scope[] }`, the feature from the node id, and trailing/leading `null` scope levels written once** | Same model, same claim hydration; the list of 101 becomes one key and 101 short scopes |

**Decision (c).**
- The client derives `feature` from the node id and walks the markers in document order, as today.
- Estimated island part: about 2.3 KB instead of 9.5 KB, so the page drops to about 12 KB (the other frameworks:
  12.6 KB). The estimate is checked by the benchmark.
- Small related cleanups:
  - the client stops `JSON.stringify`-ing all view nodes to decide whether to load `motion.ts` and `visible.ts`;
    the server writes those two flags into the payload;
  - `pruneScope` results are reused per node.

**Option (b)** stays a candidate for a later phase if many-island pages still hydrate slowly.

## Decision 3 — SSR: measure again, then compile further only where the profile points
After decision 2, serialisation should fall from half of SSR time to a small share. The expected gain is 1.6–1.9×,
to about 35–40 k renders/s.

The next lever is to generate each page's render function as JavaScript source instead of a closure tree, as
Svelte's server output does. It has a constraint: **it must be generated at build time** (`tenon build` writes
modules). Edge runtimes such as Cloudflare Workers forbid `new Function`, and ADR 0016 promised edge support.

**Decision:** this phase does decisions 1 and 2, then profiles again. Build-time code generation is written up as
a follow-up proposal with the new profile. It is not done here.

## Decision 4 — No rewrite in another language
| Option | Trade-off |
|---|---|
| a. Compiler/validator in Rust, Go or Zig | Build + validate of 1,000 features × 30 states already takes 204 ms (P2), and no output byte changes |
| b. Render in WASM | Resolvers and data are JS objects; crossing into WASM per request costs more than the rendering it would speed up |
| **c. Keep TypeScript; fix the output format and the discovery order** | The measured causes are a waterfall and a redundant payload, and neither depends on the language |

**Decision (c).** The build already uses native tools where they pay: esbuild, and the Rust engine inside
Tailwind v4.

## Targets (stated before implementation)
Measured with the corrected benchmark:

| Metric | Target | Today |
|---|---|---|
| Interactive at | **rank 1** | 61.2 ms, 4th |
| HTML raw | **≤ 12.6 KB** (the others' size), gzip ≤ 1.6 KB | 18.7 KB |
| SSR | **≥ 35,000 renders/s** (Svelte, at 92 k, stays ahead; decision 3 reports the gap) | 21,959 |
| P7 initial JS | ≤ 8,192 B | 7,676 B |
| P8 soft-navigation chunk | ≤ 3,072 B | 1,863 B |

Also: the gate stays green, parity stays 24/24, and the lock files stay valid.

## Principle check
- **Principle 8:** preloads are derived from the render plan, like everything the page loads.
- **Principle 9:** the payload still carries all server data, only encoded more compactly.
- **Authoring surface:** unchanged, so the AI trials' cost is unaffected.
- **IR:** unchanged. The payload is a runtime format between `@tenon/runtime-server` and `@tenon/runtime-client`,
  which ship together.
