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
  changes, the region keeps its DOM, gets `aria-busy="true"` and `data-hozu-settling`, and when the answer comes it
  updates its bindings in place; `ui.each` reconciles by key, so only the new row is inserted.
- `pending` means "no data yet": it shows on the first read only. A branch change (ready → an error) still swaps.
- Since both answers render the same `ready` template, there is nothing to diff: the bindings re-evaluate. A virtual
  DOM pays a diff for this; the IR makes it free.
- Same for `when` / `?:` regions whose two sides share a subtree: compile-time branch diff keeps the shared nodes
  (a button that only changes its label is not re-created).

## C2 — smoothness an agent can verify
- `hozu browse` reports, per step, **flashes** (an element removed and an equal one added in the same step) and
  **layout shift** (the browser's `layout-shift` entries). Both appear only when non-zero, so passing runs stay short.
- A bench budget: the examples flash 0 times and shift under 0.01 in their browse scripts.
- Mainstream frameworks leave this to manual QA; here a check that runs without a person says whether the page is
  calm, so "a website with quality" becomes something an agent proves.

## C3 — motion by default, derived
- A region that swaps branch or a keyed list that inserts, removes or moves animates with the same-document View
  Transitions API: the compiler gives each region and keyed item a stable `view-transition-name` from its node id and
  key. Crossfade and move by default, `motion` names still choose a custom one, `prefers-reduced-motion` turns it off,
  browsers without the API swap instantly.
- No author code: names come from the IR, not from strings the author must keep unique.

## C4 — navigation continuity without a single-page app
- Links stay document navigations (ADR 0043 I: what an agent can verify), already prerendered by speculation rules.
- **Shared-element transitions, derived:** the compiler knows which nodes two routes both render (the header, a
  component used on both, a list item with the same key on the list and its detail page) and emits matching
  cross-document `view-transition-name`s, so the card grows into the detail page instead of the page blinking.
- **State that survives navigation, derived like a layout:** a feature whose view is on both the page left and the
  page entered keeps its machine snapshot (the `pageswap` event writes it to the tab's `sessionStorage`,
  `pagereveal` restores it before the first paint). This is the Nuxt layout behaviour: state of what stays on screen
  stays. Context that the URL seeds still comes from the URL; a session change (sign-in, sign-out) drops every kept
  snapshot.

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
- Client bytes: C1 removes code paths, C3 adds a small lazily loaded motion chunk (P7 counted).

## Scope: all of it in 0.21
C1–C4 above, and the items of the 0.21 proposal (a Nuxt comparison from an agent's watchlist build):

- **F — `is([...])` for structure:** `!is(['paused']) && node` and `is([...]) ? a : b` are conditions like any other;
  `when` stays for a region with a `motion`. (Revises ADR 0064 C, which kept `is` to values.)
- **G — `replace` on a transition:** `replace: () => ui.link(route, params, search)` rewrites the address with
  `history.replaceState` without loading a page, so state the view seeds from the URL survives a reload and a shared
  link. Contracts expect `{ replace: url }`.
- **H — `ui.set(field, value)`:** an `on` handler that only copies a value into the context (a toggle, a tab) without a
  declared event: the build adds the event and a shared `on` that stays, so the IR, lock and contracts are those of the
  long form. A value that decides (a comparison or computation) is HZ014 with the long form as its fix.
- **I — component fingerprints from structure:** a component's `sourceHash` hashes its lowered render and styles, not
  `String(render)`: a bundler cannot change it, and a change to a constant the render reads now changes it (GitHub
  issue #1, point 3). `fn` bodies are code and keep the manifest fingerprints of ADR 0066.
- **J — `hozu check --update-lock` output** groups the accepted lines per transition and names only the fields that
  changed.
- **K — the guide:** a `fn` computing an attribute (an SVG path), `vars` with arbitrary-value classes for dynamic
  sizes and colours, the chart example, and a Vue / React → Hozu table.
