# ADR 0065 — 0.20.1: follow-ups from 0.20.0

- **Status:** accepted (owner, 2026-10-06: "可以，做成0.20.1，review沒問題就發佈").
- **Source:** an agent building the watchlist on 0.20.0.

## A — `hold` for browser-run mutations
- **Problem:** `hold` kept only answers of `/_hozu/effect`; a `runs: 'browser'` (or `'either'`) mutation runs in the
  page's fetch.ts, so its busy UI could not be read.
- **Options:** a hook in the production runner (bytes and a global in every app); or `hozu browse`, which answers every
  request of the page, serves the feature's fetch module through a wrapper.
- **Decision:** the wrapper. `hozu browse` serves `/_hozu/c/fetch-*.js` as a module that re-exports the original and
  wraps each export so a held effect waits for `release`. The production runtime is unchanged. `hold` accepts any
  mutation; a query is refused.

## B — `target: 'previous'` returns to the last state without `invoke`
- **Problem:** A → looking → saving → `previous` returned to `looking`, which invokes again: the lookup re-ran, possibly
  in a loop. The person was in A.
- **Decision:** the snapshot's `previous` is the last state left that has no `invoke`; leaving a busy state keeps it.
  A single busy state (0.19's watchlist) behaves as before. "Look up, then save": a machine may invoke a query (the
  machine topic said "a mutation"; the runtime always ran either), so the recipe chains `invoke(serverQuery)` →
  `invoke(browserMutation)` with `done: 'previous'`, no endpoint needed. An invoked browser-run query no longer
  re-reads the page's queries by its tags (it read itself twice).

## C — `browse` targets ignore symbols
- **Decision:** when no element's name equals the target, names are compared again without symbols and punctuation
  (`❚❚ 暫停` matches `暫停`); the match must still be unique.

## Not reproduced
SVG shapes without children: 0.20.0 accepts `ui.path({ d })` in views, parts and component renders (tested); the
reporter is asked for the snippet and `hozu --version`.
