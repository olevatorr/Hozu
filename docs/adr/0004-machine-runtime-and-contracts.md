# ADR 0004 — Machine runtime, contracts and exhaustiveness

- Status: accepted
- Phase: 1

## Context
Phase 1 makes behavior executable and verifiable: a pure transition function over the IR, a contract runner
(given / when / expect), exhaustiveness (every transition covered by a contract) and enforcement of principle 5
("every behavior change requires a contract change"). The same interpreter will later run on the client and
server (Phases 3–4), so it must be small, isomorphic and fast (budget: ≥ 1M transitions/s).

## D1 — Where the interpreter lives
Options: (a) inside `@tenon/core`, (b) inside `@tenon/runtime-client`, (c) a new isomorphic `@tenon/machine`.
**Chosen: (c).** Core holds authoring + tooling (and imports `node:crypto`); runtime-client will hold DOM code.
The interpreter is needed by the validator (Node), server and client alike. `@tenon/machine` has zero
dependencies and no `node:` imports, and counts toward the future `runtime-client` size budget.

## D2 — Interpret the IR directly vs compile it
Options: (a) walk the IR on every transition, (b) generate JS source (`new Function`), (c) compile once into
closures and index tables. **Chosen: (c).** (b) breaks under CSP and is harder to debug; (a) repeats string
lookups. `compileMachine(feature, fns)` maps states to indices and events to arrays of pre-built guard/assign
closures. Per transition it does one `Map` lookup plus closure calls.

## D3 — Semantics
- `Snapshot = { state, context, entry }`. `entry` increases on every state entry, including self-transitions.
- `Input` is data: `event` (event ref + payload), `done` / `failed` (with the `entry` they answer), and `timer`
  (with `entry` and `ms`). Inputs for a stale `entry` are ignored, so late effect results can never corrupt
  state.
- `transition(machine, snapshot, input) → { snapshot, effects, taken }`. `taken` is the id of the transition that
  fired (`idle/on/cart.AddItem/0`), or `null` if the input was ignored (unhandled, or every guard failed).
- Candidate transitions are tried in order; the first whose guard passes fires. Assign ops apply sequentially,
  and each one sees the context written by the previous op. Updates are copy-on-write.
- Effects are data, emitted in this order: `navigate` of the fired transition, then the target state's `invoke`
  (input evaluated against the new context) and one `timer` per distinct `after.ms`. Leaving a state implicitly
  cancels its timers and pending invoke; the runtime enforces this through `entry`.
- A `failed` input with an undeclared error name is handled by `Unexpected`.
- `fn()` implementations come from the build (`BuildResult.bindings.fns`), never from the IR.

## D4 — Contracts
- `given` places the machine in a state (entry 1, clock 0). Effects of that entry are not part of the
  assertion.
- Steps: `send`, `done` / `failed` (must answer the invoke of the current state), `elapse(ms)` (fires timers in
  order, restarting the clock on each state entry).
- `expect.state` is exact; `context` is exact unless `null`; `effects` (the list of invokes emitted during
  `when`) is exact unless `null`.
- Payloads, results and error data are validated against their schemas via Standard Schema (`TN017`).

## D5 — Exhaustiveness and principle 5
- Coverage = the union of `taken` ids across all contracts of a feature. An uncovered transition is `TN016`.
- `tenon.lock.json` (next to `tenon.config.ts`) records, per transition, a behavior fingerprint and the hashes
  of the contracts that cover it. The fingerprint covers the transition IR, the target state's invoke and timers,
  and the `sourceHash` of every `fn` it uses. If a fingerprint changed but none of its covering contracts
  changed, that is `TN018`. `tenon validate --update-lock` rewrites the lock only when validation has no errors.
  A missing lock skips `TN018` (the first run creates it).

## D6 — New codes and their fixes
| Code | Name | Patch |
|---|---|---|
| TN015 | contract-failed | none |
| TN016 | uncovered-transition | none (snippet: contract skeleton) |
| TN017 | invalid-contract-data | none |
| TN018 | behavior-changed-without-contract | none |

These are **judgement codes**: the right fix depends on the intended behavior. A machine-applied patch that edits
the contract to match the observed behavior would defeat the purpose of contracts. ADR 0001's mistake catalog
therefore requires a location, a source, and a fix summary for them, but not a patch.

## Consequences
- `tenon validate` runs contracts when static validation of a feature has no errors; contracts never run on an
  invalid IR.
- `tenon explain <feature>.<state>` renders incoming/outgoing transitions as pseudo-code, with the contracts
  covering each one, the invoke, the timers, and the events views can send in that state.
- Every example feature with a machine must reach 100% transition coverage.
