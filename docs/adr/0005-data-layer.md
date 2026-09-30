# ADR 0005 — Data layer: resolvers, cache, tags, scope and freshness

> **Superseded in part by ADR 0043 A (0.8.0):** D3 and D4 no longer hold: there is no per-session partition cache and no cross-request dedup. User-scoped data is read per request (`freshness: 'request'` or `'live'`, HZ049) through one per-request memo that a mutation clears, and every cache entry carries a generation so a refresh never stores data older than an invalidation. D2 stays: public resolvers never see the session (HZ020).

- Status: accepted
- Phase: 2

## Context
Queries and mutations are declarations; Phase 2 makes them executable. We must decide where implementations
live, where user identity comes from (open question Q18), what `scope` and `freshness` mean at runtime, how
tags invalidate, how requests are deduplicated, and how `tenon impact` answers "what does changing X affect".

## D1 — Implementations are separate from declarations
Options: (a) a `resolve` function inside `query({...})`, (b) implementations bound by string ref,
(c) implementations bound by declaration identity in a server-only module.
**Chosen: (c).** (a) puts server code into modules that views import, so every client bundle would carry it until
the compiler can split it. (b) violates principle 3.
```ts
export default resolvers(project, (implement) => [
  implement(getCart, (_, { session, fail }) => …),
  implement(addItem, (line, { session, fail }) => (stock < line.qty ? fail('OutOfStock', {…}) : cart)),
])
```
`resolvers` lives in the new isomorphic `@tenon/data` package, not in `@tenon/core`, which keeps the authoring surface
at 15 exports. A resolver returns its output or `fail(name, data)`; a thrown exception becomes `Unexpected`.
A missing or duplicate implementation makes `createDataRuntime` throw a structured error (`TN021`).

## D2 — Session (resolves Q18)
`project({ session: schema | null })` declares the shape of the authenticated identity; `ProjectIR.session` stores
it as JSON Schema. Where the session is visible is a structural guarantee:
- `scope: 'public'` query resolvers receive **no** session (not even as a type), so a public result cannot
  depend on the user, and caching it is safe by construction.
- `scope: 'user'` query resolvers and all mutation resolvers receive `session`.
- A user-scoped query in a project without a session is `TN020`. It has no patch, because the fix is an
  authentication decision.
Adapters supply the session per request (Phase 4). Phase 2 passes it explicitly.

## D3 — Cache partitions, freshness, dedup
- An entry key is `queryRef + canonical(input)`. Its partition is `public`, or `user:<canonical session>` for
  `scope: 'user'`. User partitions are never shared.
- `static`: cached until a tag invalidates it. `{ revalidate: s }`: an entry older than `s` is refetched
  before it is returned. `{ swr: s }`: an entry older than `s` is returned immediately and refreshed in the
  background. `live`: never cached (subscriptions come later).
- An entry invalidated by a tag is always refetched before it is returned, even under `swr`: known-changed data
  is never served.
- Concurrent identical reads share one in-flight request. Failures are never cached.
- Inputs, outputs, error data and the session are checked against their schemas. An invalid input or output
  becomes `Unexpected`.
- The clock is injectable (`now`), so all of the above is testable without timers.

## D4 — Tags and invalidation
Tag keys are evaluated per entry at fetch time (`cart.cartTag`, `catalog.productTag("mug")`). A successful
mutation evaluates its `invalidates` against its input and marks matching entries stale in the public partition
and in the caller's user partition. Matching is exact on tag and parameter. Known limitation: a mutation does not
invalidate other users' partitions; this is revisited with the Phase 4 ISR cache.
A mutation that invalidates a tag no query carries is `TN019` (warning; the patch removes the entry).

## D5 — `tenon impact <feature>.<symbol>`
Built from the IR alone: mutation → tags → queries → view nodes and invoking states, plus events → handling
states and sending nodes, and fns → using transitions and nodes. Each affected query is marked `exact` or
`param-dependent`, the latter when the match depends on runtime tag parameters.

## D6 — Codes
| Code | Name | Stage | Patch |
|---|---|---|---|
| TN019 | ineffective-invalidation (warning) | validator | remove the invalidates entry |
| TN020 | user-scope-without-session | validator | none (judgement) |
| TN021 | missing-resolver | data runtime | none |

## Consequences
- `project()` gains a required `session` key (explicit over implicit).
- The Phase 4 client runtime will reuse `@tenon/data` with a transport instead of in-process resolvers.
- New budget P6: cached query reads ≥ 1M/s.
