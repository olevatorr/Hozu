# ADR 0036 — Preload the client runtime only where an island renders

- Status: accepted (the user approved option D)
- Motivation: the site's copy button (`site/FRAMEWORK-GAPS.md`) is one island per code block, rendered by
  `ui.each` over a query. On a docs page with no code, `<head>` still has `<link rel="modulepreload">` for
  `client.js` (and `fns.js`), so the browser downloads about 8 KiB it never runs.

## What happens today
The plan and the render already disagree, and each is right about something different:
- **Plan (`@hozu/compiler`):** a route has islands when any view node *may* hydrate. `x.V/…/each/item` counts even
  if the list is empty. `plan.js` and the preload in `<head>` come from this.
- **Render (`@hozu/runtime-server`):** an island is added to the payload only when it is *rendered*. The payload
  and `<script type="module" src="client.js">` at the end of `<body>` are written only when there is one.

A reproduction (a machine-bound view, `ui.each` over a query, a button per item):

| Page | preload in `<head>` | payload | client script |
|---|---|---|---|
| `/code` (one item) | yes | yes | yes |
| `/plain` (no items) | **yes** | no | no |

So a page that renders no island already runs no JS; it only fetches it. The fix is about the preload.

## Options
- **A. Decide the preload after rendering the body.** Exact, but `<head>` could no longer be flushed first:
  in-order streaming (ADR 0007) would lose early TTFB, or streaming and string rendering would behave differently.
  Rejected.
- **B. Remove the preload from pages whose islands are all conditional.** Exact for the empty case, but a page that
  *does* render such an island loses the preload, and then loads `client.js` only when the parser reaches the end
  of `<body>`.
- **C. Preload at the first island the page renders.** The renderer writes the `modulepreload` link, which is
  allowed in `<body>`, just before the first island's HTML. It is exact, and it keeps streaming. For an island
  near the top of the page the difference from `<head>` is small, but an island below a streamed region is
  preloaded later than today.
- **D. B + C: derive where the preload goes.**
  - **Certain island:** the plan finds an island root that is not inside `ui.each`, a `ui.if`/`when` branch, or a
    `ui.query` branch, so it renders on every request. The preload stays in `<head>`, as today.
  - **Only conditional islands:** there is no preload in `<head>`. The renderer writes it at the first island that
    actually renders, or nowhere.
- **E. An author flag** (`lazy: true` on the view, or similar). Rejected: principle 8, rendering is derived and
  never chosen.

## Decision: D
- **Plan:** `RoutePlan.js` goes from `boolean` to `'always' | 'conditional' | false`, derived as above.
  - `hozu plan` prints `js: 2 islands (always)` / `js: 1 island (only when rendered)` / `none (0 bytes)`.
  - `plan.islands` is unchanged.
  - The JSON schema is regenerated, and the CLI contract bumps the `plan` output.
- **Render:** `headHtml` gets the scripts only for `'always'`. The shared `island()` in the renderer writes the
  preload links once, before the first island, when the plan is `'conditional'`. The interpreted path and the
  generated render functions (ADR 0024) both call `r.island`, so both are covered.
- **CSP:** unchanged. `modulepreload` is a link, not a script.
- **Static export:** it copies the client runtime only when an exported page actually references it (its HTML has
  the module script), instead of whenever `plan.js` is set.
- **Soft navigation (ADR 0015):** unchanged. It only works on pages whose client runs, which is already how it
  behaves.

## Principle check
- **Principle 8:** where JS is fetched stays derived: from the IR (certain vs conditional) and from what the page
  rendered. There is no new option.
- **Principle 1:** one rule for where the preload goes.

## Verification
- **Unit tests:** a certain island gives `'always'` and a preload in `<head>`. An island inside `ui.each`, a
  `ui.if` branch, a `when` branch or a query branch gives `'conditional'`.
- **Render tests** on the reproduction above:
  - `/plain` has no `modulepreload`, no payload and no script;
  - `/code` has the preload before its first island, then the payload and the script;
  - the same results from the interpreted and the generated renderer.
- **Existing examples:** the pages of cart, bookmarks, notes and showcase are expected to keep their preload in
  `<head>` (their forms and buttons sit outside branches). The test lists every example route with its `js` value,
  so any page that changes is visible in review.
- **Static export:** a site whose pages render no island writes no `client.js`.
- **Browser:** the feed/soft-navigation Chromium tests still pass. Budgets P7/P8 are unchanged.
- **The site:** the copy button can then be built as Codex first tried. That is a separate site change after this
  release.

## Result
- **Every example keeps its behaviour:** cart, bookmarks, notes, showcase, feed and blog pages with islands are all
  `always`, so their preload stays in `<head>`. On the site, `how` is `always` and every other page is `false`.
- **The reproduction** is `packages/runtime-server/test/support/conditional.ts`: `/docs/:slug` has an island in a
  query branch (streamed render), and `/notes?pinned` has one in a `ui.if` branch (generated render).
  - A page that renders no island references no JS.
  - A page that renders one has the preload right before its first `<!--i-->`.
  - In Chromium, both hydrate and respond to a click; the empty page requests no script.
  - A static export without rendered islands writes no `/_hozu/` files.
