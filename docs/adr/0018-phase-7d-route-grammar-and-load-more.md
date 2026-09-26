# ADR 0018 — Phase 7d: route grammar and load more / infinite scroll

- Status: accepted. The user approved continuing through 7d without a separate review of this ADR, on the condition
  that a principle conflict or a budget change still stops the work.
- Scope: Tier 2 items 10 and 11 of ADR 0011. This is the last Tier 2 phase.

## 1. Route grammar
| Option | Trade-off |
|---|---|
| a. File-system style (`[...slug]`, `[[lang]]`) | Excluded: Tenon has no file-based routing (principle 2) |
| b. path-to-regexp style (`*path`, `{/:x}`) | A second pattern language next to the one browsers use |
| **c. URLPattern modifiers: `:name?`, `:name+`, `:name*`** | The syntax the browser already uses for speculation rules' `href_matches`, so one pattern works in both places |

**Decision (c).** A parameter is one whole segment. Its modifier decides what it matches and what type it has:

| Pattern | Matches | Param | Schema |
|---|---|---|---|
| `/posts/:slug` | exactly one segment | `string` | a string |
| `/:lang?/about` | zero or one segment | `string \| null` | nullable string |
| `/docs/:path+` | one or more segments | `string[]` (non-empty) | array of strings |
| `/files/:path*` | zero or more segments | `string[]` | array of strings |

- **Building URLs:** `ui.link(docs, { path: ['guide', 'install'] })` builds `/docs/guide/install`. Each segment is
  URI-encoded, so a slash inside a segment is `%2F`. A missing optional segment disappears with its slash.
- **Matching:** routes are tried from most to least specific: fewer parameters first, then fewer multi-segment
  parameters. So `/docs/intro` wins over `/docs/:path+`, as `/posts/new` wins over `/posts/:slug` today.
- **TN024** (route params mismatch) also checks the schema type against the modifier: `+`/`*` need an array of
  strings, and `?` needs a nullable value. Mismatches are reported with a patch that sets the schema type.
- The same pattern goes into speculation rules unchanged (URLPattern syntax).
- One parser in `@tenon/core` serves the server matcher, the redirect overlap check (TN037) and the internal-link
  check (TN032). The client builds URLs with `pathOf` and matches soft-navigation targets with its own small copy,
  so the initial JS does not import the core.

## 2. Load more and infinite scroll
| Option | Trade-off |
|---|---|
| a. `ui.query` with `mode: 'append'` (ADR 0011's sketch) | A query node with hidden, accumulated client state: a second kind of state next to the machine |
| b. A page number or cursor in `search` | Works without JS and can be shared, but every "load more" is a navigation that scrolls to the top and re-renders all pages |
| **c. The machine holds the list of loaded cursors; each cursor is its own `ui.query`** | Uses only existing concepts: context, `op.append`, `ui.each` and `ui.query`. Every page is cached and deduplicated like any query |

**Decision (c): a pattern, not a new data concept.**
```ts
// context: { cursors: (string | null)[], last: string | null }, initially { cursors: [null], last: null }
ui.each(ctx.cursors, null, (cursor) =>
  ui.query(listItems, { cursor }, {
    ready: (page) => ui.div({}, [
      ui.each(page.items, 'id', (item) => ui.article({}, [item.title])),
      ui.if(op.and(op.eq(cursor, ctx.last), op.neq(page.next, null)), [
        ui.button({ type: 'button', on: { click: ui.send(More, { cursor: page.next }) } }, ['Load more']),
      ], []),
    ]),
    pending: ui.p({}, ['Loading…']), failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
  }))
// idle: on(More, { target: 'idle', guard: (e) => op.neq(e.cursor, ctx.last),
//                  assign: (e) => [op.append(ctx.cursors, e.cursor), op.set(ctx.last, e.cursor)] })
```
- **First page:** rendered on the server, as today.
- **Later pages:** fetched by the client (ADR 0010's client fetch of new query keys) and appended in place. There
  is no navigation and no scroll jump.
- **Without JavaScript, "load more" does not accumulate.** A native form post runs the machine from its initial
  state (ADR 0014), so a form carrying the next cursor shows the first page and that one only. A second post then
  shows pages 1 and 3. Carrying every loaded cursor in the form is out of scope. So "load more" needs JS, and a list
  that must be crawlable or usable without JS pages through `search` (`?after=c20` links), as the bookmarks filter
  does. Found while building the example; the ADR originally claimed the form worked.
- **Only the last page shows the control.** `ctx.last` holds the last loaded cursor, and a page shows "Load more"
  only when its own cursor is `ctx.last` and its result has a `next`. The same value guards `More`, so a double
  click or a sentinel that fires twice cannot load a page twice.

### A `visible` event for infinite scroll
| Option | Trade-off |
|---|---|
| a. A widget wrapping IntersectionObserver in each app | A client module per app for a platform capability every list needs |
| **b. A framework event `visible`** (`on: { visible: ui.send(More, { cursor: page.next }) }`) | One more name in the closed event vocabulary; no new node kind |

**Decision (b).**
- `visible` fires when the element enters the viewport. It carries no DOM fields.
- The build adds `data-tenon-visible` to elements that listen for it. A lazy chunk watches those elements with one
  IntersectionObserver and one MutationObserver, so elements added later (the next page's sentinel) are covered.
- The chunk loads only when a page's payload uses `visible`. P7 grows only by that check. If it overflows, work
  stops and the number is raised with the user.
- Without JavaScript nothing fires (see above).

## Diagnostics
None new. TN024 is extended to check that the schema matches the modifier. `visible` is typed like every event.

## Example
`examples/feed`:
- a feed of 60 items loaded 10 per page with a cursor: a "Load more" button and a `visible` sentinel for infinite
  scroll;
- `/tags/:path+` for nested tags;
- `/archive/:year?` for an optional segment.

Its contracts cover the append and the duplicate guard. Chromium checks that scrolling loads the next page without
a navigation.

## Budgets
- **P7 has 30 B left.** Two things add to it: `pathOf` handling modifiers (it runs in the client for `ui.link`) and
  the `visible` check. Both are kept minimal and measured. If the total goes over 7,680 B, the work stops and asks.
- **P8** grows with the navigate matcher's modifiers.
- **A4:** no new public generics are planned.

## Implementation notes
- **P7: 7,650 → 7,674 B (6 B left).**
  - `pathOf` with modifiers added 20 B, trimmed to 8 B by normalising params with `[x ?? []].flat()`.
  - The `visible` check first reached 7,692 B. The "only once" flag moved into the lazy chunk, and hydration now
    syncs every app after mounting (new apps included, which is harmless). Together that fit the budget again.
  - The next client feature cannot fit without splitting something out or raising P7.
- **P8: 1,773 → 1,863 B**, from the soft-navigation matcher's modifiers and specificity ranking.
- **Gate:** P2's scaling exponent was 1.135 (limit 1.14). Across the last three gates it has been 1.131, 1.096 and
  1.135, so the metric is noisy near its limit. It is reported, not re-run.
- **`More` carries a nullable cursor.** `page.next` is `string | null` and `ui.if` does not narrow types, so the
  guard also rejects `null`.
- **`/tags` is a 404,** because `:path+` needs at least one segment; `/archive` renders with `year: null`.
