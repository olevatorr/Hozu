# ADR 0058 — 0.17: DevTools for Figma hands

- **Status:** implemented (owner, 2026-10-04: "全都做呀，反正都放 devtool … 直接搞個 0.17.0", both Builder and Developer).
- **Sources:**
  - a review of the DevTools overlay against Figma's Design panel, Dev Mode and comments (2026-10-04);
  - the 0.16 review notes (a `feature({ styles })` that is not a list crashed `hozu check`);
  - the site's DevTools page, now animated (0.16 site).

## The theme
A designer who lives in Figma should find DevTools where their hands already are: the same keys, the same
measurements, the Design panel in the same order and the same words. Everything here is DevTools: it loads only
under `hozu dev`, so production pages, P7 and the authoring surface do not change. Both audiences get it; Builder
shows design tokens first, Developer shows classes first, as today.

## A — keys and measurement
### A1 — Figma's selection keys
- **Problem:** Alt+click selected the parent. In Figma, Alt is *measure*, Shift+Enter selects the parent, Enter the
  first child and Tab / Shift+Tab the next / previous sibling.
- **Options:**
  1. Keep Alt+click and add the Figma keys beside it. Alt cannot mean both, and measuring needs Alt.
  2. Figma's keys; Alt only measures. ↑ / ↓ stay as they were (Figma has no meaning for them in a selection).
- **Decision:** 2. CHANGELOG says Alt+click no longer selects the parent.

### A2 — size on the selection
- **Decision:** a selected part shows `W × H` (CSS px, rounded) under its frame, as Figma does.

### A3 — Alt measures
- **Decision:** with a part selected, holding Alt and pointing at another part draws red distance lines with px
  labels: the gaps between two separate parts, or the four insets when one contains the other. With nothing
  selected, Alt measures the part under the pointer against its parent. Releasing Alt removes the lines.
- **Trade-off:** a few hundred lines of overlay code, measured from `getBoundingClientRect` only (no CSS parsing),
  which is what a designer checks against the design.

## B — the Design panel
### B1 — Figma's order and words
- **Problem:** Look had seven rows in its own order and words ("Space at the sides").
- **Decision:** Look is grouped like Figma's Design panel: **Frame** (width, height, corner radius) → **Auto layout**
  (gap, horizontal and vertical padding) → **Layer** (opacity) → **Fill** → **Stroke** (weight, colour) →
  **Effects** (shadow) → **Text** (size, weight, colour). Builder uses Figma's words; Developer the CSS names.
- **New properties:** width, height, gap, opacity, border width, border colour and shadow, each mapped to the theme
  utility the agent should write (`w-*` / `w-full`, `gap-*`, `opacity-*`, `border` / `border-2`, `border-<colour>`,
  `shadow-<name>`), with the nearest theme step when the value is off the scale, as for the existing seven.

### B2 — tokens first in Builder
- **Decision:** Builder options read `2xl · 24px`, `lg · 8px`, `md · shadow`; a colour shows `red · #fb3a0e` when it
  is a theme colour. Developer keeps `text-2xl · 24px`. The request the agent reads is unchanged: it still names the
  utility to write.

## C — Figma's words elsewhere
- **Decision:**
  - scope: "This instance only" and "Main component: every Button (6 places)" (the request text stays "only this
    one" / "every Button");
  - agent notes and saved requests: **Resolve** instead of Done (the CLI keeps `hozu requests done`);
  - the Workbench button and its exit: **Frame** ("Exit frame");
  - the states in Layers stay "States".
- **Not changed:** the request Markdown and the CLI, which agents read.

## D — the site
- **Decision:** the DevTools page gets two more CSS animations in the 0.16 style (Alt measuring with `W × H`; the
  Design panel in Figma's order), and the home page a "Feels like Figma" section with the measuring animation and
  the mapping (Figma → DevTools).

## E — a crash found in 0.16
- `feature({ styles: new URL(…) })` (not a list) crashed `hozu check` with `flatMap is not a function`. It is HZ014
  with the list form as the fix.

## F — `hozu dev` left its app running (found while building D)
- `kill <pid>` on `hozu dev` (what it prints) stopped the dev server but not the app process it spawned, which kept
  the second port. Old orphans from 2026-09-26 tests were still running.
- **Decision:** `hozu dev` closes on SIGINT / SIGTERM / SIGHUP, and the app watches `HOZU_DEV_PARENT` and exits when
  the parent is gone (SIGKILL included). Tested both ways.

## G — Assets: every component on one page (owner, 2026-10-04: "主要就是可以有一頁面可以看到所有組件 … storybook又臭又長也不適合")
- **Options:** a side panel (small thumbnails) or a full-screen board like Figma's canvas. **Decision:** the board.
- **How:** `componentCatalog(build)` (core) lists components, variants, defaults, slots, the props schema with an
  example built from its required fields, and where each is used (node, view, pages). `hozu serve` under `hozu dev`
  gives the handler `dev.render(id, use)` (the `hozu render` path, `IsolatedUse` gains `children`). Endpoints
  `/_hozu/dev/components`, `/_hozu/dev/component`, `/_hozu/dev/previews`, loopback only. Thumbnails are sandboxed
  iframes (no scripts) with the page's stylesheets, filled when they scroll into view.
- **Styles** reads `/_hozu/dev/theme` (the parser now keeps `--shadow-*`).

## H — `previews.ts` (owner: "是不是就可以有個資料層是用來做那些特殊畫面? 打包的時候不會進去，且ai實作的時候也不要讀")
- **Options:** a file-name convention (`*.preview.ts`; against "no file-based magic"), stories inside views (in the
  authoring surface agents read; noise), or a module named in `project({ previews })` like `app`. **Decision:** the
  named module, built with `previews()` from `@hozu/core/preview`.
- **Never shipped:** the CLI imports it for `hozu dev`, `hozu check` and `hozu render`; the handler swaps query
  results only when `dev` is set and the `hozu-dev-preview` cookie names a screen; such a page is `private,
  no-store`, `noindex` and skips the page cache. A production handler ignores the cookie (tested).
- **HZ092** (new code: registry, rule in `hozu check`, fix, catalog cases in `packages/cli/test/previews.test.ts`).
- **Agent noise:** not in `hozu map`; SKILL.md: read it only when asked or when HZ092 names a line. A schema change
  that breaks a preview costs the agent the one line HZ092 names, which keeps the previews true.

## Results
- A: Shift+Enter / Enter / Tab / Shift+Tab, `W × H`, Alt measuring (`overlay/measure.ts`, unit-tested; a browser test
  measures the gap between the heading and the form of `examples/notes` against `getBoundingClientRect`).
- B: Design panel in seven groups with fourteen properties; `utilityFor` / `currentUtility` cover the seven new ones
  (theme test); a browser test previews gap and stroke weight and reads `gap-4` / `border-2` in the copied request.
- C: Figma's words in the overlay; the request Markdown is unchanged (prompt test).
- D: two more CSS animations on the DevTools page and a "For designers" section on the home page; 0 JS.
- E, F: HZ014 for a non-list `styles`; `hozu dev` takes its app down on SIGTERM and SIGKILL (both tested, both
  failing before the fix).
- G, H: `componentCatalog`, `dev.render`, the three endpoints, the Assets board and Styles, `previews.ts` with
  HZ092; tested in `packages/cli/test/previews.test.ts` (catalog, resolution, HZ092 cases, rendering),
  `packages/runtime-server/test/dev.test.ts` (screens uncached, production ignores the cookie, loopback only) and
  a real-mouse browser test (Assets, wheel, Styles, Screens). Found while testing: the board did not take pointer
  events (clicks reached the page) and panels let scroll-hijacking libraries scroll the page; both fixed.
- The 0.16 streaming test measured the first byte at the client in the same process, which vitest delays at times;
  it now checks what left the server before the second chunk (fails without the flush).
- Gate: 121 files, 792 tests; P7 7 886 B (unchanged: DevTools loads only under `hozu dev`).
