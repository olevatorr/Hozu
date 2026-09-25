# ADR 0002 — Feature IR and authoring surface

- Status: accepted
- Phase: 0

## Context
The IR is the source of truth; TypeScript is a typed authoring surface over it. We must decide the IR shape,
how authoring maps to it deterministically, and how the open questions in CLAUDE.md are resolved.

## Decisions

### D1 — Logic is data (declarative ops + named pure functions)
Options: (a) pure declarative DSL, (b) arbitrary TS functions, (c) declarative ops + opaque named `fn()`.
**Chosen: (c).** Context updates are `AssignOp`s (`set`, `append`, `inc`, `removeWhere`), guards are
`GuardExpr`s (`eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `and`, `or`, `not`), values are `ValueExpr`s (path refs,
literals, objects, `fn` calls). Anything else is a `fn({ input, output, impl })`: opaque in the IR, but typed by
schemas and fingerprinted by `sourceHash`. (a) blocks practical needs; (b) makes the IR incomplete.

### D2 — Recorder proxies, never evaluated logic
Callbacks such as `assign: (payload) => [op.set(ctx.pending, payload)]` run once at build time with typed path
proxies. A proxy used as a JS value (`ctx.count + 1`, template strings) throws and becomes `TN014`. Recorders run
lazily inside `buildProject`, so a second build (the determinism check, `TN011`) re-executes them.

### D3 — Identity naming; references by identity
Declarations are created unnamed (`const AddItem = event({ payload })`) and named exactly once, by their key in
`feature({ events: { AddItem } })`. Registering one identity twice is `TN013`; using an unregistered identity is
`TN003`/`TN007`. IR references are strings `featureId.symbolId` (the same syntax as `tenon impact cart.addItem`).
Identities carry a `Symbol.for('tenon.decl')` brand, so they survive duplicate module instances.

**Principle-3 interpretation (raised, not bent):** machine *state names* are local string literal keys, typed by
TypeScript (`NoInfer<S>`), not declaration identities. They never cross a declaration boundary; a typo is a
compile error and `TN007` with a "did you mean" fix. Tags and routes, which do cross boundaries, are identities
(`tag()`, `route()`).

### D4 — Machine shape
Flat FSM, at most one machine per feature, optional (no machine ⇒ the feature ships 0 JS). Effects are only
started by a state's `invoke` (on entry), and settle via `done` / `failed`. `failed` must list every declared
error plus the framework `Unexpected` (`{ message: string }`) — no wildcard. Timers are `after: [{ ms, ... }]`
on a state; navigation is `navigate: routeDecl` on a transition. `invoke.input` may only read `context`.
Multiple transitions for one trigger are tried in authoring order; a guardless one must be last (`TN009`).

### D5 — Schemas
One schema adapter per project (`project({ schema: zodAdapter })`, `@tenon/schema-zod`). A schema from another
Standard Schema vendor is `TN012`. The IR stores JSON Schema, interned per feature by content hash
(`s_` + 16 hex of sha256). The client never ships the schema library.

### D6 — Views
`ui.view({ machine, render })` where `machine` is the feature's own machine or `null`. Nodes: closed HTML tag
whitelist (`ui.div`, `ui.button`, …) taking `(props, children)`, `class` is a static string, `on` maps
`click | submit` to `ui.send(Event, payload)`; plus `when(states, children)` (typed to the
machine), `ui.each(source, key, item)`, `ui.query(query, input, { ready, pending, failed })`, `ui.embed(view)`.
Node ids are path-based (`cart.CartPanel/1/0`), stable across builds, and reserved for hydration.
A node may send an event only if every state in which it can be visible handles it (`TN005`). For another
feature's event the sender cannot observe the owner's state, so every owner state must handle it.

### D7 — Boundaries and exports
`imports: { catalog }` names the features a feature may use. `exports: { events, queries, mutations, tags,
fns, views }` lists identities. Using another feature's declaration requires both (`TN006`). "Public contract"
means `exports`; behavioral specs are `contracts` (given / when / expect, executed in Phase 1).

### D8 — Canonical form
Every `feature()` key is required (explicit over implicit); the IR has no optional keys (`null` / `[]` / `{}`).
Maps are sorted by key; `exports` lists and `when.states` are sorted; transition lists, children and `after`
(stable-sorted by `ms`) keep order. Objects with only literals collapse into `{ literal }`.
`canonicalStringify` + sha256 gives the IR hash. Source locations (captured from V8 call sites at declaration
time) live in a sidecar `SourceIndex` keyed by IR JSON Pointer, never in the IR. `buildProject(p, { sources })`
turns capture off for builder calls made during the build (on, invoke, ui nodes); the IR is identical either way.

### D9 — Loading
The CLI loads `tenon.config.ts` with Node's native type stripping (Node ≥ 22.18) instead of `jiti`:
zero dependencies, faster cold start, exact source positions. Consequence: authored code is erasable-syntax TS
with explicit `.ts` relative imports, which matches principle 2.

## Public surface of `@tenon/core` (15)
`project, feature, route, event, query, mutation, fn, tag, machine, on, invoke, ui, op, contract,
defineSchemaAdapter`. Tooling (IR types, `buildProject`, canonical JSON, codes) lives in `@tenon/core/ir`.

## Consequences
- Some verbosity (`errors: {}`, all feature keys) is accepted in exchange for zero implicit defaults.
- Arbitrary computation is possible only through `fn()`, which Phase 1 contracts must cover.
- Nested/parallel states, DOM value sources (`input.value`) and route params are deferred to later ADRs.
