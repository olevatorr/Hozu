# ADR 0057 — 0.16: room in the client budget, complete share cards, compression, and what learning costs

- **Status:** implemented (owner, 2026-10-04: "A + B, start planning", then "ok" on this ADR). Released in 0.16.0.
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
- **Result: 8 123 → 7 884 B (308 B of room).**
  - **Measured first:** the initial graph is one file. Its biggest inputs are `mount` (8.2 KB raw), `hydrate`
    (3.5 KB) and the machine `compile` (3.1 KB). Motion, component setup, visible, fetch, uploads and dev were
    already loaded on demand.
  - **The client component use moved to the component chunk:** building and claiming the host element and wiring
    its props and events now load with the component chunk, so only pages with a client component pay for them
    (−178 B).
  - **The keyed list's move animation moved to the motion chunk:** measuring the rects and the FLIP now load with
    `motion.track` (−51 B).
  - **An unread field removed:** `Item.value` was written and never read (−10 B).
  - **Checked by:** the runtime-client, component, adapter-node browser (list enter / leave) and `hozu browse`
    tests.

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
  - `lastmod` comes from a new optional `entries.lastmod: (item) => item.updatedAt`, an ISO date of each entry,
    and is omitted otherwise (as ADR 0056 A13 decided, no guessed dates). **Changed while building:** the plan
    read the page's `published`, but `published` belongs to the head query (one item by its params), while the
    sitemap walks the entries query (the list); reading the head for every entry would run a query per URL. The
    entry says it explicitly.
  - `site.url` takes `{ env: 'SITE_URL' }`, like `feature({ connect })`. The handler and the static export read
    it at startup and refuse to start without an origin; the variable must be declared (HZ085, whose summary now
    covers it). A literal URL stays the usual form.
  - The pages topic says that `hozu get --select 'meta[property^="og:"]'` reads the head.

### A3 — the DevTools test that fails once in eleven runs
- **Decision:** find the cause; do not add retries. The test ("the inspector moves out of the way…") failed in
  219 ms, so the failure is an early exception, not a timeout. Record the cause in this ADR.
- **Result:**
  - **Not reproduced:** the file passed 20 runs in a row (14 of 14 each), with four dogfood agents loading the
    machine.
  - **Cause not found:** the one failure came in the run right after the Layers test's reload race was fixed
    (`cf1fed6`), and its message was not kept.
  - **Kept as it is:** the test stays without retries, and the gate keeps running it. A next failure keeps its log
    and reopens this item.

### A4 — the SSR drift (analysis first)
- **What:** `bench/frameworks/ssr-only.ts` against the published tarballs at 0.5, 0.8, 0.9, 0.11, 0.12, 0.13, 0.14 and
  0.15, interleaved on one idle machine, each with the bench app of its own release.
- **Decision rule:** a single step of 5 % or more gets a fix in this release if it is not the cost of a feature
  (for example the component markers); otherwise the drift is recorded as the price of the features, with
  numbers.
- **Result (median renders/s of three interleaved rounds, one idle M4 Pro, each release with its own bench app):**

  | 0.5 | 0.8 | 0.9 | 0.11 | 0.12 | 0.13 | 0.14 | 0.15 | 0.16 |
  |---|---|---|---|---|---|---|---|---|
  | 57.1 k | 56.3 k | 56.6 k | 52.8 k | 48.9 k | 49.3 k | 49.4 k | 48.8 k | 55.0 k |

  - **Two steps over 5 %, neither the price of a feature:** each added a walk of every island node on every render.
    0.11 found the browser-run queries a page's islands read (`clientEffects`); 0.12 found the routes and endpoints
    they link to (`linkTargets`). Both answers depend only on the IR objects, which are shared between renders.
  - **The fix:** each answer is kept per IR object (a `WeakMap`), so a node is walked once per process. 47.3 k →
    55.0 k renders/s on the same machine, the level of 0.9. The HTML is byte-identical.

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
- **Result (`bench/meta`, one idle M4 Pro):**
  - Without compression, Hozu answers 16.9 k req/s (16.4 k on 0.15, before A4).
  - With gzip accepted, it answers 11.9 k req/s: about 27 % for the compression, against 9 % for Next.js (1.5 k).
    That is still 7.7× Next.js with compression and 1.7× SvelteKit without it.
  - **Changed while building:** the first version flushed after every chunk, and cost 40 %. It now flushes when
    the stream waits (`setImmediate`), so the head still arrives first and a page that renders at once is one
    deflate. The gzip level did not matter (4 and 6 measured the same).
  - Every HTML page is 12.3 KB raw and 1.8 KB on the wire.
  - **Found by the Workbench tests:** `hozu dev` forwarded the browser's `Accept-Encoding` to the app, then injected
    its script into the compressed page, so no page loaded under `hozu dev`. The dev server now asks the app for
    `identity`; a dev test with a compressing app keeps it so.

### B3 — what learning costs (analysis first)
- **What:** trial 0024's cold-arm transcripts, measured as ADR 0038 did. Tokens are counted by what produced them:
  reading `SKILL.md`, reading topics (which ones), diagnostics, tool output, the agent's own edits, and repeated reads.
- **Decision rule:** the largest item that a change to the guide or the tools can remove gets a change in this
  release, with a prediction recorded here before a re-run of three held-out steps checks it. Anything larger
  becomes a 0.17 ADR.
- **Result (`anatomy.mjs --v2` over the eight held-out steps, carried tokens by what produced them):**

  | | Hozu cold | Nuxt | Gap |
  |---|---|---|---|
  | reading the guide (`docs`) | 165 k | 0 | +165 k |
  | the start of every call (`start`) | 382 k | 265 k | +117 k |
  | reading files (`read`) | 294 k | 229 k | +65 k |
  | the change and spec (`spec`) | 83 k | 25 k | +58 k |
  | verifying (`verify`, 42 turns against 7) | 56 k | 7 k | +49 k |
  | weighted total | 1.30 M | 0.86 M | +0.43 M |

  - **The guide reads were mostly `browse` grammar:** `hozu docs testing` was read five times. Of 43 `hozu browse`
    runs, 10 failed on a label the agent guessed (`fill Share with=bob` for a field named `name`). Each retry re-ran
    a whole multi-actor chain, and two forms the agent wrote naturally were refused: `in "<text>"` before the value,
    and several steps in one `--do` joined with `;`.
  - **Changed in this release:** both forms are accepted; a missing target prints `Did you mean "<closest label>"?`
    before the labels on the page; the testing topic points at `hozu get --forms` for labels.
  - **Prediction:** on the same held-out steps, fewer than half the `browse` runs fail on a target, `verify` turns
    fall from 42 toward 25, and `hozu docs testing` is read at most twice.
  - **Checked (2026-10-05) with the published 0.17.1,** which keeps the 0.16 changes. All eight held-out steps were
    run, not three, in two runs each, from trial 0024's step-20 apps migrated with `hozu migrate`
    (`results-0024-b3/`). Same model, isolation and acceptance as trial 0024.

    | Held out 21–28, two runs | 0.14 cold | 0.17.1 cold | Prediction | Result |
    |---|---|---|---|---|
    | `browse` runs failing on a target | 17 of 88 | 8 of 81 | fewer than half | **Holds** (−53 %) |
    | `hozu docs testing` reads | 10 | 1 | at most two | **Holds** |
    | `verify` + `serve` turns | 99 | 98 | 42 → toward 25 per run | **Fails** (38 and 60) |
    | guide tokens carried (`docs`) | 391 k | 270 k | | −31 % |
    | weighted tokens against Nuxt (geometric mean of per-step ratios) | 1.37× | 1.30× | | −5 % |
    | steps passing every check | 16 / 16 | 16 / 16 | | equal |

    - **Why `verify` did not fall:** the turns moved from repairing `browse` steps to checking more cases. Run b
      spent 22 of 40 turns at step 23 on cases the change did not ask about: a title of non-breaking spaces, a
      1 001-character body, a stale form posted after the note was archived in another tab. Testing a stale form
      meant starting a server and copying a form's `__hozu` action out of the HTML for `post`; a step that submits
      a form as it was when the page loaded would remove that.
    - **Interrupted acceptance runs:** as in trial 0024, an agent's `pkill -f "hozu serve"` stopped another arm's
      acceptance server (two runs of the warm and previews arms here). Re-running the acceptance on the committed
      code passes (`NN.accept-rerun.json`), and so did trial 0024's three held-out ones, re-checked again.
  - **Next, for 0.17:** the `start` gap (+117 k) is what every call carries before the agent acts: the skill listing
    and the app's agent block. It needs its own ADR.

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
