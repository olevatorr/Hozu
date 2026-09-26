# ADR 0019 — Phase 8a: typed environment, field-level invalid input, optimistic UI, and two gate changes

- Status: accepted. The user allowed raising budgets and changing measurements as long as the performance
  targets themselves are not lowered, and asked to continue without a separate review. Principle conflicts and new
  third-party dependencies still stop the work.
- Scope: Tier 3 items 13, 16 and 18 of ADR 0011. Items 14 (fonts), 15 (content collections) and 17 (HMR) are
  phase 8b. Item 15 may need a Markdown parser, which is a third-party dependency and needs approval first.

## 1. Gate changes (ADR 0001 requires an ADR to change a budget)
### P7: 7.5 KiB → 8 KiB
- **Measured:** 7,674 B after 7d, which left 6 B.
- **Target it serves:** the smallest initial client of the compared frameworks except Preact
  (docs/benchmarks/0001: Preact 5.4, Tenon 7.1, Svelte 18.7, Vue 30.9, React 67.7 KB gzipped). At 8 KiB Tenon is
  still second, and less than half of Svelte. The target does not change; the budget moves within it.
- **Rule for the new room:** every optional capability keeps its lazy chunk. The initial chunk only holds hydration,
  the DOM runtime and the machine.

### P2: steadier measurement, same budget
- **Before:** each size ran 3 fresh processes in order (250, 500, 750, 1000); the exponent is the log-log slope of
  the best times. The last three gates gave 1.131, 1.096 and 1.135, against a limit of 1.14. Load drift during
  the run lands on the largest sizes, which moves the slope.
- **After:** five interleaved rounds over 250, 500, 1000 and 2000 features, keeping the best time per size.
  Interleaving spreads drift over every size, and the wider range makes the slope less sensitive to one point.
- **Check:** four back-to-back runs of each method on this machine gave 1.076–1.112 before and 1.095–1.106 after,
  a spread three times narrower.
- **Unchanged:** the budget (exponent ≤ 1.14, i.e. 2× input → ≤ 2.2× time) and the absolute budget
  (< 500 ms at 1000 features).

## 2. Typed environment (item 13)
| Option | Trade-off |
|---|---|
| a. Resolvers read `process.env` directly (today) | Untyped, unvalidated, Node-only, and nothing stops a secret from reaching a view |
| **b. `project({ env: { server: schema, public: schema } })`, validated when the handler starts** | Typed and checked. Only the public part can reach a view |

**Decision (b).**
- `env: null | { server: Schema | null, public: Schema | null }`. It is a required project field; `env: null` means
  none.
- **Startup:** `createHandler({ env })` parses both schemas once. Coercions and defaults such as `z.coerce.number()`
  apply. Any issue throws, naming every missing or invalid key, so a misconfigured deploy fails at startup instead
  of on the first request.
  - adapter-node passes `process.env` by default.
  - Edge entries pass the platform's env object.
- **Server values** reach resolvers as `ctx.env`, typed from the server schema. They never reach the IR, a view or
  the payload.
- **Public values** are read in views with `ui.env(PublicEnv).KEY`, a reference typed by the same schema. The
  validator checks the path against `env.public`, and a view cannot name a server key.
- **Lowering:** the server replaces public env references with literals when it serialises island nodes, the same way
  it lowers locale references (ADR 0017), so the client JS does not grow.

## 3. Field-level invalid input (item 18)
| Option | Trade-off |
|---|---|
| a. Every mutation declares its own validation error | The shape differs per mutation, and it duplicates the input schema |
| b. A mandatory `Invalid` handler on every invoke | Correct, but every existing machine must change |
| **c. A framework error `Invalid`, like `Unexpected`, that handlers may name** | One shape everywhere. Machines that do not name it keep working |

**Decision (c).**
- **Shape:** `{ message: string, fields: Record<string, string> }`. `fields` maps each invalid path, joined with dots
  (`'title'`, `'items.0.qty'`; the root is `''`), to its first message.
- **When it happens:**
  - the data runtime returns it when a mutation's input fails the input schema. Today that is an `Unexpected`;
  - resolvers can return it for business rules: `fail('Invalid', { message, fields: { title: 'Already taken' } })`.
- **Handling:** `failed.Invalid` is optional. Without it, the machine's `Unexpected` transition handles it, and
  `message` keeps `e.message` meaningful there. TN004 does not require it. TN007 stops rejecting it.
- **Views:** read `ctx.fields.title` directly, e.g. `ui.if(op.neq(ctx.fields.title, null), [ui.p({ role: 'alert' },
  [ctx.fields.title])], [])`.
- **Without JS:** a native form post re-renders the page with the same fields (ADR 0014).
- **Queries** keep `Unexpected` for invalid input: their inputs come from typed views, not from people.

## 4. Optimistic UI (item 16)
| Option | Trade-off |
|---|---|
| a. An optimistic list in context, appended on submit and removed in every `done`/`failed`, plus a validator rule for missing removals | Explicit rollback that every exit has to repeat |
| **b. Render the in-flight value from context while the machine is in its busy state** | Rollback is structural: leaving the state hides it. Busy states already ignore new submits (TN005), so one value is in flight at a time |

**Decision (b): a pattern, no new API or diagnostic.**
```ts
when(['adding'], [ui.li({ class: 'opacity-50', 'aria-busy': 'true' }, [ctx.draft])])
```
- The query list refreshes through the mutation's `invalidates`, so the real item replaces the pending one.
- A failure returns to `idle`, removing the pending row, and shows the error.
- `examples/bookmarks` shows the pending bookmark. The skill documents the pattern.

## Diagnostics
None new:
- TN004 and TN007 learn about the optional `Invalid`;
- TN008 checks `ui.env` paths against `env.public`.

## Example and verification
- `examples/bookmarks` handles `Invalid` and renders the pending item. Its contracts are updated with intent: a
  duplicate title stays `Duplicate`, and an invalid input is `Invalid` per field.
- `examples/cart` declares `env` (a public support email shown in the footer; a server-side stock limit read by the
  resolver). The edge check passes the env explicitly.
- Tests:
  - env parse and startup failure, public lowering, server env never in HTML or the payload;
  - `Invalid` from a schema failure and from a resolver, and the `Unexpected` fallback;
  - the no-JS form re-render showing field messages.

## Implementation notes
- **A4: 55,000 → 65,000** (the gate failed at 59,463).
  - The framework's own types did not grow: the 7d cart checked against the 8a packages measures 52,766, down from
    53,186.
  - The +6,700 comes from the cart example using more zod (`z.coerce`, `.default`, `.email` in its env schemas).
  - `tsc` check time for the cart is 0.023 s either way (0.06 s total), so the target A4 protects, a responsive type
    check, is unchanged. A4 measures the example, so it grows with what the example demonstrates.
- **P9 regression found and fixed.** Public env made the cart's island nodes go through lowering (ADR 0017) on every
  request, which cost about 10% (9,400 req/s). Lowered nodes are now cached per node, locale and public-env object;
  only nodes with `ui.alternate` are lowered per request. P9 is back to ~10,300 req/s.
  - Compared with the 12,300 req/s measured before 7b, that is −16%, accumulated over 7b–7d. It is within the 20%
    limit of ADR 0016, and is recorded here rather than hidden.
- **`Invalid` field keys come from the mutation's input.** `fields` has one key per top-level input property, and
  every key is present (`string | null`). A `Record<string, string>` would type `ctx.fields.title` as
  `string | undefined` under `noUncheckedIndexedAccess`, which views cannot render. A nested issue path
  (`items.0.qty`) maps to its top-level field.
- **`Invalid` is a reserved error name for mutations (TN014).** The trial app from ADR 0015's trials had declared
  its own `Invalid` for title validation, which confirms the name. It now uses the framework error. Its acceptance
  run (`bench/trial/accept.mjs`, phase 1) still passes 12/12.
- **Server env is parsed by the data runtime** (`createDataRuntime({ env })`), so defaults and checks apply however
  the runtime is created. The handler parses only the public part.
- **Two flaky tests fixed:** the widget test now also waits for the second widget's setup, and the feed Chromium
  test waits for an idle main thread before clicking. Both passed alone and failed only under gate load.
