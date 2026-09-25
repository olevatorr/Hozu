# ADR 0006 — Rendering: runtime choice, render plans, and the cacheability boundary

- Status: accepted
- Phase: 3

## Context
Views are closed `ui()` trees in the IR. Phase 3 decides how they become DOM, derives a render plan per route
and node (principle 8), and makes user-scoped data reaching a cacheable region a hard error. Budgets set in
ADR 0001: `runtime-client` ≤ 5 KB min+gz; machine-less pages ship 0 bytes of JS.

## D1 — Renderer: own runtime vs compile to an existing renderer
| Criterion | Own runtime (fine-grained, no VDOM) | Compile `ui()` to Preact / Solid / Vue Vapor |
|---|---|---|
| Size | DOM glue plus `@tenon/machine`; target ≤ 5 KB | Preact ~4 KB before our glue and machine; Solid ~7 KB; Vue Vapor larger |
| Hydration granularity | Per IR node: islands are exactly the machine-bound nodes | Per component root; needs component wrappers per island |
| AI debuggability | 1:1 IR node id ↔ DOM (`data-t`), no second tree to reason about | IR → JSX → VDOM → DOM: three representations in stack traces and devtools |
| What the IR already guarantees | Static structure, known bindings, no user functions: the reasons a VDOM exists are gone | Pays for generality (arbitrary components, effects) that the IR forbids |
| Implementation cost | Higher: we own DOM updates, lists, events | Lower up front; ongoing cost of compiler + version coupling |
| Ecosystem | None needed (closed world) | Available, but unusable without breaking principle 4 |

**Chosen: own runtime.** A closed IR removes the need for a VDOM. Each dynamic binding (a text or attribute
that reads `context`, a `when` visibility, an `each` source) compiles to one updater. The machine snapshot is the
single source signal; after every transition each updater recomputes its value and writes the DOM only if the
value changed. Lists re-render when their source identity changes; copy-on-write context makes that exact. Keyed
diffing is deferred until a benchmark demands it.

## D2 — Where data comes from on the client
Query nodes read from a **payload** (`Map<ref + canonical(input), Result>`) supplied at mount time. The client
never fetches (principle 9). A missing entry renders `pending`. The Phase 4 SSR fills the payload.

## D3 — Effects in the client runtime
The runtime owns `after(ms)` timers (framework-owned effect). `invoke` and `navigate` go to host callbacks
(`onInvoke`, `onNavigate`); `onInvoke` resolves to a data `Result`, which the runtime feeds back as `done` or
`failed`. Phase 4 connects `onInvoke` to a transport.

## D4 — Pages and render plans
- `project({ pages: [{ route, views, assert }] })` says what a route renders. Views are referenced by identity;
  pages live in the project because routes are also navigation targets, and declaring them there avoids import
  cycles.
- Every `ui.query` node opens a **region**. A region's mode combines its own mode with its parent region's; the
  more dynamic one wins (`static < isr < swr < request`), and for `isr` / `swr` the shorter interval wins:
  - public + `static` → `static`; public + `{ revalidate }` → `isr`; public + `{ swr }` → `swr`;
  - `scope: 'user'` or `live` → `request` (rendered per request, never cached).
- The page shell is `static`. Nested regions are holes: a `request` region inside a static shell is streamed
  per request (Phase 4), and the shell stays cacheable.
- A node **hydrates** iff it is machine-bound: an element with `on`, a `when`, or a value that reads `context`.
  The topmost hydrating nodes are the page's **islands**. `js = islands.length > 0`.
- `assert: 'static' | 'cacheable' | null` is checked against the plan, never obeyed. `static` requires every
  region to be `static`; `cacheable` forbids `request` regions. A violation is `TN023`.

## D5 — The cacheability boundary (principle 8 hard error)
Region holes keep user HTML out of cached shells. The remaining path for user data into shared caches is
**inputs**: a public, non-`live` query whose input reads a binding that comes from a `request` region with user
scope. That query's result would be cached in the shared public partition, keyed by user-derived data. That is
`TN022` (error, no patch: either the query is really user-scoped or the input must not depend on the user).

## D6 — Packages
- `@tenon/compiler`: `planRoute(ir, route)`; `tenon plan <route>` renders it.
- `@tenon/runtime-client`: `mount(target, { view, feature, machine, payload, fns, onInvoke, onNavigate })`. It
  imports only `@tenon/machine` and `@tenon/core/canonical` (a new side-effect-free subpath), never
  `node:` modules.
- Size is measured by bundling `@tenon/runtime-client` with esbuild (minify, browser target) and gzipping it
  (new budget P7, ≤ 5 KB).

## D7 — Codes
| Code | Name | Patch |
|---|---|---|
| TN022 | user-data-in-cacheable-region | none (judgement) |
| TN023 | render-assertion-violated | none (judgement) |
Dangling page routes or views reuse `TN007`; a route rendered by two pages reuses `TN013`.
