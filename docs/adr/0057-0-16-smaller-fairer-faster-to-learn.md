# ADR 0057 — 0.16: room in the client budget, complete share cards, compression, and what learning costs

- **Status:** proposed (owner, 2026-10-04: "A + B, start planning"). Each phase starts after the owner confirms this
  ADR.
- **Sources:**
  - the 0.15 gate (P7 at 8 123 of 8 192 B);
  - the site's share images (no `twitter:card`, no image size);
  - `bench/meta` (Hozu sends uncompressed; Next.js compresses);
  - benchmark 0001's SSR note (0.56× → 0.50× of Svelte since the sixth run);
  - the DevTools browser test that failed once in eleven runs;
  - trial 0024 (learning is most of what remains: 1.32–1.42× Nuxt cold, 1.02–1.06× known);
  - the 0.14 dogfood's open SEO items.

## The theme
Ship less, measure fairly, learn faster. Nothing in 0.16 changes the authoring surface unless a phase below says so,
so 0.15 apps upgrade without a migration step.

## Phase 0 — dogfood 0.15 (B2, runs in the background from the start)
- **What:** four apps built from scratch with the published 0.15.0, each by an isolated agent session outside this
  repository, each writing `FRICTION.md` (as `hozu-dogfood-0.14`).
- **The briefs** use what 0.15 added:
  1. a shared workspace where members see only their own and shared items (`owner` and `allow` access, Forbidden
     pages, `hozu browse` as two visitors);
  2. a booking API with bearer tokens (endpoints, `hozu call --header`, errors with data);
  3. a bilingual content site judged on SEO (i18n, sitemap, share cards, `hozu get --select` on the head);
  4. a dashboard changed three times after it is built, with the agent showing each change (`hozu show`).
- **Output:** each finding reproduced, then fixed in Phase C or recorded for 0.17.
- **Cost:** about four agent sessions of the size of the 0.14 round. No external service.

## Phase A — debt and risk
### A1 — room in P7 (the client budget)
- **Problem:** 69 bytes left. The next client feature fails the gate, and the budget would be raised under pressure.
- **Options:**
  - raise the budget — rejected: P7 is the promise that a page ships little JavaScript;
  - trim what grew since 0.12 (the fn module registration, the component runtime, motion, the hydrate fallbacks),
    measured per module, keeping behaviour.
- **Decision:** trim. **Target:** at least 300 B of room, measured by P7 itself; the shipped behaviour is checked
  by the existing runtime-client and browser tests, and B2 (`bench:frameworks`) still counts the clicks.

### A2 — complete share cards and the sitemap
- **Problem:**
  - Without `twitter:card`, X shows the small card, not the 1200×630 image.
  - Without `og:image:width` / `height`, some crawlers fetch the image before they lay out the card.
  - The sitemap has no `lastmod`.
  - A deployment that sets `site.url` per environment reads `process.env` in the config by hand.
- **Decisions:**
  - `twitter:card` is derived: `summary_large_image` when the page has an image at least 600 px wide,
    `summary` otherwise.
  - `og:image:width` and `og:image:height` are derived from the image file at build time (PNG, JPEG, WebP and GIF
    headers, read without dependencies). `og:image:alt` is the page title; no new head field.
  - `lastmod` is the page's `published` date when `entries` render it; otherwise it is omitted (as ADR 0056 A13
    decided, no guessed dates).
  - `site.url` takes `{ env: 'SITE_URL' }`, like `feature({ connect })`, parsed with the project's env at startup.
    A literal URL stays the canonical form; HZ084 / env rules apply.
  - The pages topic says that `hozu get --select 'meta[property^="og:"]'` reads the head.

### A3 — the DevTools test that fails once in eleven runs
- **Decision:** find the cause; do not add retries. The test ("the inspector moves out of the way…") failed in
  219 ms, so the failure is an early exception, not a timeout. Record the cause in this ADR.

### A4 — the SSR drift (analysis first)
- **What:** `bench/frameworks/ssr-only.ts` against the published tarballs at 0.5, 0.8, 0.9, 0.11, 0.12, 0.13, 0.14 and
  0.15, interleaved on one idle machine, each with the bench app of its own release.
- **Decision rule:** a single step of 5 % or more gets a fix in this release if it is not the cost of a feature
  (for example the component markers); otherwise the drift is recorded as the price of the features, with
  numbers.

### A5 — `funding` in every package
- `"funding": "https://ko-fi.com/hozu"` in each published `package.json`; `npm fund` then lists it.

## Phase B — product
### B1 — compression in adapter-node
- **Problem:** `bench/meta` found Hozu sends HTML and JavaScript uncompressed (19.8 KB of JavaScript on the wire, 8 KB
  gzipped). Next.js compresses by default. Behind a proxy that compresses, this does not matter; without one, it
  does.
- **Options:**
  - **leave it to the proxy** (document only): the edge platforms already compress; a bare `npm start` does not;
  - **compress everything on the fly:** simple, but spends CPU on every request for files that never change;
  - **precompress the static files at build and compress HTML on the fly.**
- **Decision: the third, in adapter-node only.**
  - `hozu build` writes `.br` and `.gz` next to each static file of `dist/public` (`client.js`, the fn modules, the
    CSS, the component and fetch chunks), with `node:zlib` (no dependency).
  - adapter-node picks `br`, then `gzip`, by `Accept-Encoding`, sets `Content-Encoding` and `Vary: Accept-Encoding`.
  - HTML and JSON answers are gzipped on the fly with a flush after each streamed chunk, so streaming SSR keeps its
    order and timing.
  - The web-standard handler (`createHandler`) stays uncompressed: edge platforms compress for it.
- **Measured by:**
  - a test that each encoding round-trips and that a streamed page still arrives in order;
  - P9 (req/s through adapter-node) before and after, reported;
  - `bench/meta` again with every framework behind the same compression, and the static variants of Nuxt,
    SvelteKit and Hozu next to Next.js's. The site's Speed table is updated from that run.

### B3 — what learning costs (analysis first)
- **What:** trial 0024's cold-arm transcripts, measured as ADR 0038 did. Tokens are counted by what produced them:
  reading `SKILL.md`, reading topics (which ones), diagnostics, tool output, the agent's own edits, and repeated reads.
- **Decision rule:** the largest item that a change to the guide or the tools can remove gets a change in this
  release, with a prediction recorded here before a re-run of three held-out steps checks it. Anything larger
  becomes a 0.17 ADR.

### B4 — the Workbench on a narrow window
- Below 1 100 px the Layers column folds into a button in the toolbar, and opens over the page. The browser tests
  cover both widths.

## Phase C — what the dogfood finds
- Each finding: reproduced, fixed with a test, and listed in the CHANGELOG.

## Not in 0.16
- `hozu show` over MCP: no client needs it yet.
- ADR 0054 option C (a declared data layer), session-aware tags, more than one machine per feature, checks at the
  level of the requirement: one of them may be proposed for 0.17, chosen with the dogfood's evidence.

## Release
- The gate is green at the end of each phase. 0.16.0 when A, B and C are done.
- No breaking change is planned. If one appears, it needs this ADR amended and a migrate step.
