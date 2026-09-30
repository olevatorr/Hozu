# ADR 0041 — 0.7: write less (URL-seeded context, shared helpers, module declarations, machine-wide transitions)

> **Superseded in part by ADR 0043 (0.8.0):** A's soft-navigation note no longer applies, since soft navigation is removed (I). E's shorter start is replaced by K: `changing.md` is folded into a SKILL.md of at most 4 096 B, and `hozu map` starts with the session shape, the verify line and the files.

- Status: accepted (the owner chose A–E, with C as the only form)
- Motivation: an investigation of trials 0016–0018.
  - On the notes task `hozu add feature` writes most of the app, and a Hozu build *outputs* about half of what Nuxt
    does.
  - On the widget task nothing is generated: Hozu apps are 1.5–1.9× Nuxt's lines (852–1100 against 544–572), and a
    change adds 214–529 lines against Nuxt's 61.
  - Hidden reasoning scales with what is written, at about 45 % of output tokens.
  - **So the lever is what the surface forces an agent to write.** The investigation found four such things, and one
    reading cost.

| Finding (widget task) | Evidence |
|---|---|
| A machine cannot start from the URL | every Claude run wrote `ctx.typed ? ctx.search : search.q` 19–23 times, plus `typed` / `chosen` flags; so did Codex (`ctx.q ?? search.q`) and `examples/stations` |
| `fn` bodies cannot share a helper | the same filter predicate is written 3–6 times per run; `fn` code is 61–81 lines |
| Every declaration is imported and listed again | `declarations` ≈ 40 lines and imports ≈ 45 lines; each new event, `fn` or contract is edited in twice |
| A transition shared by modes is written per state | `Search`, `ToggleFavorite` and `SetDistrict` appear in `idle` and `touring` in every run and the reference app |
| Changing starts with 11.5 KB of guide | 8/8 change runs read `SKILL.md` and `changing.md`, whose recipes fit only the notes task |

## A. `seed`: a machine's context from the page's URL
- **Decision:** a view with a `machine` and a `route` may declare
  `seed: ({ params, search }) => ({ q: search.q, district: search.district })`.
  - It is a builder callback that returns top-level context fields, lowered to a map `field → ValueExpr`
    (`ViewIR.seed`).
  - When a page creates the feature's machine, its context is `initialContext` with these fields replaced. This holds
    for the server render, hydration (the render puts the seeded snapshot in the payload), and the machine a native
    form post runs.
- **Rules:**
  - HZ048 is reported when:
    - a seed field is not in the context;
    - a view seeds without a machine or a route;
    - two views on one page seed the same machine.
  - A seeding view reads `search` / `params`, so it is never kept across a soft navigation (ADR 0015 derivation).
- **Contracts are unchanged:** they test the machine from `given`.
- **Effect:** the view reads `ctx.q` only. The flags and their `?:` disappear, and a new URL filter is one seed field.

## B. `fn` bodies may call self-contained module helpers
- **Decision:** the transform now resolves a name that a `fn` body uses but does not declare:
  - to a module-level function (declaration or `const` arrow / function expression);
  - or to a `const` whose value is JSON (numbers, strings, arrays, plain objects).
  - This applies when the helper itself uses only its own parameters and locals, JS globals, or other such helpers
    (resolved transitively).
- **How it is shipped:**
  - The transform passes them as getters: `__hozu.helpers(fn({...}), { matches: () => matches })`.
  - `fnsModule` wraps that entry as `(() => { const matches = <source>; return <impl> })()`.
- **HZ047 remains** for everything else: imported names, and helpers that close over other module state.
- **Effect:** one predicate, used by every `fn` that needs it.

## C. `declarations` is a list of modules
- **Decision:** `feature({ id, intent, declarations: [model, views] })`, where the entries are namespace imports
  (`import * as model from './model.ts'`).
  - Every exported declaration is registered under its export name, sorted by brand. Other exports (schemas, helpers)
    are ignored.
  - A name exported by two modules is HZ013.
- **The layout becomes `model.ts` + `views.ts` + `feature.ts`.** `feature()` moves out of `views.ts`, because a module
  cannot list its own namespace while it is being evaluated.
- **The record form `declarations: { A, B }` is removed.**
  - It is HZ014, and the fix is the module form.
  - Plain objects are still accepted inside the list (`declarations: [{ A, B }]`), for tests and one-file apps. It is
    the same concept: a set of named exports.
- **Principle 2:** this is still explicit. The namespace import names every module, and nothing is discovered from the
  file system.
- **Effect:** a new declaration is written once. `hozu add widget` adds `widgets` to the list instead of editing a
  record.

## D. `machine({ on })`: transitions shared by every state
- **Decision:** `machine({ …, on: ({ ctx }) => [on(Search, { assign: (e) => { ctx.q = e.text } })], states })`.
  - At build, each shared transition is copied into every state that is not busy (no `invoke`), not final, and neither
    handles nor ignores that event itself. A state's own entry wins.
  - A shared transition may omit `target`, which means the state it fires in.
- **The IR, the runtime, contracts and the lock are unchanged.** The expansion is visible in `hozu explain`.
- **Effect:** modes (a tour, an edit mode) no longer repeat the transitions they share.

## E. A shorter start for changes
- **`changing.md` keeps the loop** (map, edit, check, verify) and the table of change kinds, in about 2 KB.
- **The worked recipes move to `hozu docs recipes`.** Those are the enum field, the bulk action, the detail field and
  the detail page.
- **The skill and the scaffold** use A–D, with `examples/bookmarks` and `examples/stations` rewritten to them.

## Measure
- **Trial 0019:** the widget task and the notes task, two Claude runs each. Compared with trial 0018 (widgets) and
  trial 0016 (notes).
- **Targets, stated before the runs:**
  - widget build ≤ 1.8× Nuxt and change ≤ 2.5×;
  - the notes task no worse than trial 0016 (1.38× / 1.45×);
  - all acceptance checks passing.

## Result
- **Implemented as decided,** with three details settled along the way:
  - `target` is omitted only in machine-wide entries; a state's own transition without one is HZ014;
  - HZ016 counts identical copies of a transition (with a self-target normalised) as covered together;
  - `hozu add widget` adds `widgets` to the module list and imports the widget into `views.ts`.
- **Trial 0019** (two Claude runs per task, all checks passing):
  - widget build 1.75× Nuxt and change 2.03×, both targets met;
  - notes build 1.14×;
  - **notes change 1.68×, which misses its target.**
- **The notes regression came from E:** the per-item recipe had left `changing.md`. A row in its table now carries the
  steps and the contract answer.
- **Re-measured with that row:** the notes change is 1.38× (84.1 k), so every target is met.
