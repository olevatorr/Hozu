# ADR 0015 — Phase 7a: soft navigation that keeps shared views alive

> **Superseded by ADR 0043 I (0.8.0):** soft navigation is removed, with `navigate.js`, `payload.soft`, the plan's soft section and budget P8. Every internal link is a document navigation with speculation prerender and the cross-document View Transition opt-in; state across pages lives in the URL (seed), on the server (queries) or in a widget's own storage. The panel case below is withdrawn.

- Status: accepted
- Scope: Tier 2 item 6 of ADR 0011 (soft navigation, persistent layouts, scroll, focus, announcer, progress).
  ADR 0011 splits Tier 2 into four phases; this is the first. 7b (web-standard handler, middleware as data),
  7c (images, i18n) and 7d (load more, route grammar) each get their own ADR.

## Problem
Every navigation is a document navigation. Speculation rules prerender the target and cross-document View
Transitions animate the swap, so it is fast and ships no JS. But every machine starts again from its initial
state: an open cart panel, a playing player or a half-typed chat message is lost when the user follows a link.

Today a page is its `views` rendered in order into `<body>`. Pages already share views (the cart's `home` and
`orderPlaced` both list `ProductGrid`). What is missing is keeping a shared view's DOM and machine across the
navigation.

## 1. How the next page is produced
| Option | Trade-off |
|---|---|
| a. Render the next page on the client from the IR | Ships every view, query and machine to the client; breaks "only machine-bound nodes hydrate" and "server data is never refetched" (principles 8, 9) |
| b. A separate partial endpoint (`/_tenon/page?url=`) returning only the changed views | Smaller responses, but a second cache key per page and a second render path to keep equal to the first |
| **c. Fetch the same URL the document navigation would load, and swap regions** | One render path and one cache entry (ISR/SWR keyed by canonical URL, ADR 0014). Persistent views' HTML is transferred again and discarded |

**Decision (c).** The server does not change except for view boundary markers (section 3). The fetched document
carries its own payload, so server data is still serialized once and never refetched.

## 2. Which views persist
| Option | Trade-off |
|---|---|
| a. Author declares it: `ui.page(route, { layout: [...], views: [...] })` | A new field and a second place to list views; wrong declarations show stale content |
| **b. Derived from the pages' `views`** | No new authoring surface; checkable, shown by `tenon plan` |

**Decision (b).** A view is kept across a navigation from page A to page B when all of these hold:
1. it is listed in both A and B, in the same relative order as the other kept views (no DOM moves, so media,
   iframes and focus inside it are never disturbed);
2. it is **route-independent**: its tree, its machine's initial context and its query inputs never read
   `params`, `search` or the head binding. References are structural in the IR (`{ ref: 'params' }`), so this
   is a walk over the view, not a choice;
3. it contains at least one island. A static view is replaced; it costs nothing to re-render and cannot hold
   state.

A view that reads `params` or `search` is always replaced, so it can never show the previous page's values.
Principle 8 holds: persistence is derived, and `tenon plan <route>` lists it per target page.

## 3. When soft navigation is used at all
Soft navigation only pays off when there is state to keep. Everything else keeps today's document navigation,
prerender and zero JS.

- The compiler derives, per page, the set of target pages that share at least one persistent view (section 2).
  It is sent in the payload as `soft: { [routeId]: viewRef[] }`, next to the existing `routes` table.
- The client intercepts a navigation only when all of these hold:
  - the browser has the Navigation API;
  - the target is same-origin and matches a route in `soft`;
  - the navigation is a plain push/replace/traverse (no download, no modifier key, no `target`, no form POST).

  Anything else is left to the browser. So links to pages without persistent views still use prerender.
- A page's speculation rules exclude its soft targets (`{ not: { href_matches: { pathname: route.path } } }`).
  Otherwise the browser prerenders the target on hover and the soft navigation fetches it again, rendering the
  page twice. Each page's rules are fixed, so the CSP header lists the hash of every distinct rules text and is
  still computed once at startup.
- Every top-level view is wrapped in boundary comments, `<!--v:feature.View-->` … `<!--/v-->`, so the client
  can find each view's DOM range.

## 4. The swap
1. Fetch the target URL (`accept: text/html`). A non-200 response, a cross-origin redirect or a non-HTML body
   falls back to `location.assign`, so 404/500 pages behave exactly as today.
2. Parse it with `DOMParser`. Scripts in the parsed document are inert, so CSP is untouched.
3. Keep the ranges of persistent views. Replace every other range with the new document's range, inside
   `document.startViewTransition` when available. Existing `view-transition-name` CSS then works for both
   navigation kinds.
4. Update `<title>`, description, canonical, Open Graph and `lang` from the new `<head>`. The stylesheet is
   project-wide and does not change.
5. Destroy the apps of features that no longer have an attached island (`App.destroy`, which exists).
6. Hydrate the new ranges with the new payload:
   - merge its `data` into the shared store;
   - a feature whose app survives keeps its live machine, and new islands of that feature attach to it. The
     server's snapshot for that feature is ignored, because the client state is the newer one;
   - islands inside kept ranges are skipped.

## 5. Scroll, focus, announcer, progress
- **Scroll and focus**: `NavigateEvent.intercept({ scroll: 'after-transition', focusReset: 'after-transition' })`.
  The browser restores the scroll position on back/forward, scrolls to the top or the hash on push, and moves
  focus to `<body>`, as it does on a document navigation.
- **Announcer**: a visually hidden `aria-live="polite"` element, created on the first soft navigation, receives
  the new document title.
- **Progress**: `<html data-tenon-navigating>` is set while the fetch runs. Styles hook onto it like any other
  `data-*` attribute, so there is no new API.
- **Leave guard**: deferred (see "Not in this phase").

## 6. Behaviour and contracts
- No new authoring API, IR field or builder. Contracts do not change: `navigate` still emits
  `{ navigate: url }`, and whether the browser performs it softly is a runtime concern.
- One behaviour does change: a machine in a persistent view keeps its state across navigation, where it used to
  restart. This is the goal of the phase. It is documented in the skill and shown by `tenon plan`.
- No new diagnostic. Every rule is derived, so there is no author mistake to report. If implementation shows one
  (for example, a view reading `params` only through a `fn`), it gets a code with registry, rule, fix and
  mistake-catalog case as usual.

## 7. Budgets
- **P7 stays at 7.5 KiB.** The soft-navigation code is a lazy chunk, imported only when the payload has a
  non-empty `soft` table. The estimate of < 60 B for the initial entry was wrong: it grew by **281 B
  (7,360 → 7,641 B)**, leaving 39 B of headroom. The growth is not the import itself:
  - hydration now applies a payload through a reusable `mount` step (feature apps are created only when missing,
    data is merged, live queries accumulate), so the chunk can apply the next page's payload (192 B);
  - an app stops updating islands that were attached while connected and have since left the document, and
    reads `motion` when it animates, so a kept app can attach islands from a later page (89 B).

  Moving more into the chunk would duplicate hydration. The next phase that adds initial client code must either
  split something out (candidates: live queries, uploads) or raise P7 in its ADR.
- **New metric P8: soft-navigation chunk beyond the initial JS, min+gz, budget ≤ 3 KiB: 1,773 B.** It holds
  interception, fetch/parse, range swap, head update, the announcer, per-view island tracking and a URL → route
  matcher over the `routes` table the payload already carries.
- A4 rose from 51,134 to 53,106 type instantiations, because `examples/cart` gained a route, a page and a view.
  No public type of the framework changed.

## 8. Verification
- Unit tests (happy-dom): range detection, the persistence derivation, head update, and feature apps being
  destroyed or kept.
- Browser test (Chromium, `CHROMIUM_PATH`) on the cart example:
  - the cart panel's contents survive home → product → home;
  - back restores the scroll position;
  - the title and announcer update;
  - no `/_tenon/query` request is made;
  - a link to a page without persistent views is still a document navigation.
- Parity stays 24/24. The showcase has no persistent island views, so its navigation does not change.

## 9. Example
The cart gains a `product` page (`/products/:sku`, views `[ProductDetail, CartPanel]`, product names in the grid
link to it), so `CartPanel` (an
island that reads no params) persists between `home` and `product`. `examples/bookmarks` is unchanged, because
its two pages share no view. The skill gets one section in `patterns.md`: "shared views with a machine keep
their state across links".

## Found during implementation
- **Duplicate rendering diagnostics.** A view shared by two pages reported TN022 once per page. The rule now
  reports each code and pointer once.
- **Verification.** Unit tests cover the derivation (including a machine that reads `search`), the boundary
  markers, and the swap in happy-dom. A Chromium test checks the whole flow with the real Navigation API:
  - the cart's quantity stays 5 and the window is not reloaded;
  - the push scrolls to the top, and back restores 900 px;
  - exactly one `fetch` is made per navigation, with no prerender and no `/_tenon/query`.

## Not in this phase
- **Leave guards** (`beforeNavigate` / `useBlocker`). They need a declared state flag and a contract form for
  "leaving is blocked". Proposed as a small follow-up once soft navigation exists.
- **Shallow routing without a server round trip.** A search-only change is already a soft navigation that
  keeps every view not reading `search`. Skipping the fetch would need client-side query execution, against
  principle 9.
- Moving kept views that change relative order (`Element.moveBefore`). Such views are replaced instead.

## Consequences
- Pages with persistent island views get app-like navigation, and nothing changes for any other page.
- Authors write nothing new, so change cost (trial 0005) is unaffected.
- Browsers without the Navigation API get document navigation, which is correct and only less smooth.
