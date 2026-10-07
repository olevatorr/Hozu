# ADR 0067 — 0.21: Continuity, a page that never flashes, derived from the IR

- **Status:** accepted (owner, 2026-10-08: "感覺可以在0.21 全部放進去的大改版 全部都做"; first: "想像一下有質感的網站，按個按鈕、只是query更換就一直重新渲染閃畫面，這是很大的缺點 …
  既然現有技術沒有辦法解決 … 你創造一個規劃一個如何？").
- **Baseline** (`hozu browse --full`, `examples/watchlist`):

  | Step | Elements replaced |
  |---|---|
  | Refresh now (same query input) | 0, text updated in place |
  | Pause | 1, the swapped button |
  | Add a second symbol (query input changes) | 14: the whole table, the first row included, with `pending` in between |

  The client is already fine-grained (no virtual DOM). The flashes come from two choices, not from the engine: a query
  region whose input changes is treated as new content, and every link is a document load.

## What no mainstream framework can do, and Hozu can
Vue and React learn the page by running it. Hozu knows the whole page before it runs: every node, what each node
reads, which nodes two branches share, which views two routes share, and the key of every list. Continuity is
derived from that knowledge, so authors write nothing new and agents cannot get it wrong.

## C1 — settle, never replace
- A query region's identity is its query and its branch (`pending`, `ready`, an error), not its input. When the input
  changes, the region keeps its DOM, its parent element gets `aria-busy` (counted, so two regions under one parent
  do not clear each other; it is also the styling hook), and when the answer comes it updates its bindings in place;
  `ui.each` reconciles by key, so only the new row is inserted. A request that fails (offline, a 502) shows the
  `Unexpected` branch, never the old rows as if they answered.
- `pending` means "no data yet": it shows on the first read only. A branch change (ready → an error) still swaps.
- Since both answers render the same `ready` template, there is nothing to diff: the bindings re-evaluate. A virtual
  DOM pays a diff for this; the IR makes it free.

## C2 — smoothness an agent can verify
- `hozu browse` reports, per step, **flashes** (an element removed and an equal one added in the same step) and
  **layout shift** (the browser's `layout-shift` entries). Both appear only when non-zero, so passing runs stay short.
- A flash compares tag, class and the whole text, so a keyed list where one row leaves and another enters is not
  one. The examples were swept with it (`examples/cart` now disables its controls while busy instead of hiding them).
- Mainstream frameworks leave this to manual QA; here a check that runs without a person says whether the page is
  calm, so "a website with quality" becomes something an agent proves.

## C3 — motion by default, derived
- What an update adds fades in (160 ms, rising 4 px with `translate`, which leaves an SVG
  `transform` alone): a region that was empty and now shows something, a keyed list that gains items while keeping
  all of its others. A replacement (one branch for another, a row for a different row) does not fade: a fade on a
  swap reads as a flicker. Only the start keyframe is given, so an element's own opacity is where it ends. Nothing
  animates on the first render, items that stay keep still (C1), `prefers-reduced-motion` turns it off, and a
  `motion` name still chooses a custom one.
- **Implementation choice:** the Web Animations API on the added elements, not `document.startViewTransition`. A view
  transition snapshots the whole page and holds input while it runs, so a keystroke that updates the context would
  freeze typing; animating only what was added costs nothing elsewhere and works in every current browser. The cross-
  document case (C4) does use view transitions, where a page change is the snapshot anyway.

## C4 — navigation continuity without a single-page app
- Links stay document navigations (ADR 0043 I: what an agent can verify), already prerendered by speculation rules,
  and cross-fade (`@view-transition { navigation: auto }`, since 0.8).
- **The shell keeps still:** the build marks the root of every view two or more pages show with `data-hz-view`, and
  `@hozu/css` gives it a `view-transition-name`, so a header or a panel on both pages stays in place while the rest
  cross-fades. Derived from `ui.page` lists; nothing to write.
- **State that stays on screen stays:** on a click and when a page is left (`pagehide`), each machine not in a busy
  state is kept in the tab's `sessionStorage` (the click matters: a prerendered next page can be shown before this one
  hides). The next page hydrates the server's view first, so the DOM it claims is the one the server sent, and then
  enters the kept state of a machine it shows too (same structure), so its timers run and C3 fades in what it adds.
  A prerendered page waits for `prerenderingchange` before it reads, since the click has not happened yet while it
  prerenders. Fields the address seeds come from the address. A kept snapshot comes back only to the same visitor:
  the page carries `who`, a hash of the session value (it sits only in that visitor's own uncached page, so it needs
  no salt, and a module-level random salt would break Workers, which refuse random values at startup), and a
  different mark gives nothing back. In an app with a session, a cacheable page cannot know its visitor (`who:
  null`), so it keeps and restores nothing: a sign-out between two cached pages never hands a draft on. A session value that changes on every
  request (a `refreshSession` that stamps a time) therefore keeps nothing. Half an hour at most; a reload, framed pages
  and DevTools state previews keep nothing; a page whose server ran the machine (a native post) uses the server's
  snapshot.
- A query read that fails stays the `Unexpected` answer for that input until a tag re-reads it; retrying by itself
  while offline would loop.
- Kept state is per machine, not per address: a draft in a machine that two `/posts/:id` pages show comes along to
  the next post unless the view seeds that field from the address. That is the contract to teach: what belongs to one
  item is seeded or reset.
- The server renders the page before the kept state is known, so a kept state that differs shows the server's view
  for a moment until the client enters it. Rendering the kept state on the server would need it in a cookie; that is
  left for later.
- `data-hz-view` marks only a view whose root is an element and that each page lists once (a name twice on one page
  would abort the whole transition).

## Options considered
- **Become a reactive function framework (Vue / React style):** loses the IR, and with it the derived render plans,
  0 JS pages, HZ049, contracts, the lock and source-located DevTools. Rejected: the owner's stated gains (speed, easy
  for AI) come from the IR.
- **Bring back soft navigation:** ADR 0043 I removed it as unverifiable; C4 gets the experience with documents.
- **Opt-in transitions per region:** every agent would have to remember them; derived defaults make the calm page the
  one nobody has to ask for.

## Risks
- C1 changes when `pending` shows (first read only); an app that relied on it flashing on every input change sees
  the old rows until the answer, marked busy. CHANGELOG and the patterns topic say so.
- View Transitions: same-document in Chromium, Safari 18 and Firefox (recent); cross-document in Chromium and Safari
  18.2. Elsewhere the page swaps instantly, as today.
- C4's snapshot handoff must never carry user data past a session change, and must not restore into a different
  machine IR (the dev restore already checks this).
- Client bytes: C1 removes code paths; C3's fade is a few lines in the main chunk (`el.animate`). C4's keeping is a
  lazy chunk (`keep.ts`, requested when hydration starts and never waited for, like `poll.ts`), so P7 is 8 935 B of 9 KiB;
  a click before it loads is not kept, the page hide still is, and the page is ready (B2) before it applies.

## Scope: all of it in 0.21
C1–C4 above, and the items of the 0.21 proposal (a Nuxt comparison from an agent's watchlist build):

- **F — `is([...])` for structure:** `!is(['paused']) && node` and `is([...]) ? a : b` are conditions like any other;
  `when` stays for a region with a `motion`. (Revises ADR 0064 C, which kept `is` to values.)
- **G — `replace` on a transition:** `replace: () => ui.link(route, params, search)` rewrites the address with
  `history.replaceState` without loading a page, so state the view seeds from the URL survives a reload and a shared
  link. Contracts expect `{ replace: url }`.
- **H — `ui.set(field, value)`:** an `on` handler that only copies a value into the context (a toggle, a tab) without a
  declared event: the build adds the event and a shared `on` that stays, so the IR, lock and contracts are those of the
  long form, and the build checks a native post's value against the field's schema like any payload. The value may
  be computed (`ui.set(ctx.open, !ctx.open)`): it is copied, nothing branches on it, so it decides nothing (the lock
  says so). Two fields that need one event name (`ctx.a_b` and `ctx.a.b`) are HZ014.
- **G (continued):** every effect of a transition (`navigate`, `refresh`, `copy`, `replace`) reads the context after
  its `assign`, like the `invoke` input of the state it enters. Until 0.20 `navigate`, `refresh` and `copy` read the
  context from before; a `navigate` that depends on it is a deciding transition, so its contract shows the change. A
  `replace` to another route is HZ014 (that is a `navigate`). Browsers limit `replaceState` calls; one that throws is
  skipped and the machine goes on.
- **I — component fingerprints from structure:** a component's `sourceHash` hashes its lowered render and styles, not
  `String(render)`: a bundler cannot change it, and a change to a constant the render reads now changes it (GitHub
  issue #1, point 3). `fn` bodies are code and keep the manifest fingerprints of ADR 0066.
- **J — `hozu check --update-lock` output** groups the accepted lines per transition and names only the fields that
  changed.
- **K — the guide:** a `fn` computing an attribute (an SVG path), `vars` with arbitrary-value classes for dynamic
  sizes and colours, the chart example, and a Vue / React → Hozu table.

## Later
- A mode that busy states inherit: `is(['paused'])` while adding from paused is false today, so a control that
  follows the mode swaps during the busy state (`hozu browse` reports it); parallel regions or busy states that show
  their calm state would remove it.
- Rendering a kept state on the server (it would need the state in a cookie), so the first paint already shows it.
- `when` / `?:` regions whose two sides share a subtree: a compile-time branch diff could keep the shared nodes (a
  button that only changes its label). `is()` with an attribute (`disabled: !is(['idle'])`) covers the common case.
- A bench budget over browse scripts (flashes 0, shift under 0.01) once every example has a script.
