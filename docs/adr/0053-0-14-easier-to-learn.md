# ADR 0053 — 0.14: easier to learn (fewer choices, quieter checks, generated diagnostics)

- **Status:** proposed (2026-10-03). Owner decisions D1–D8 below are open.
- **Problem:** the largest cost of building with Hozu is that models do not know it yet.
  - Nuxt is in every model's training data; Hozu is learned from the guide in each session (trial 0002, trial
    0020). The measured 1.34–1.72× tokens per change against Nuxt (trial 0021) mostly pays for that learning
    (ADR 0038).
  - Until Hozu is in training data, the lever is how much there is to learn, and how well the tool teaches while the
    agent works.
- **Size today (0.13.0):**
  - 81 diagnostic codes, 16 of them warnings;
  - 22 CLI commands;
  - 21 guide topics totalling 72.7 KB, the largest being `diagnostics.md` at 10.9 KB (a hand-written table);
  - `SKILL.md` at 3.98 KB.
- **What the 0.13 trial agents tripped on:**
  - a default that hid a choice: `runs` omitted means `'either'` and needs a fetch.ts, so the first query is HZ081;
  - two commands for one job (`check`, `validate`);
  - a warning that can never be cleared (HZ036 keeps `check` at "1 warning", which teaches agents to ignore
    warnings);
  - a fix that contradicted its cause (HZ021);
  - a fix that offered a rename as the way out (HZ084);
  - a guide copy that went stale silently.

## Decision (proposed)

### A. `runs` is required (breaking)
- Every `query` and `mutation` states `runs: 'server' | 'browser' | 'either'`; there is no default. One canonical
  form (principle 1), explicit over implicit (principle 2).
- A missing `runs` is a type error, and a diagnostic in untyped code.
- **Migration:** 0.13 → 0.14 writes `runs: 'either'` where it is omitted, which is exactly the current behaviour,
  so the IR does not change.

### B. One check command (breaking)
- `hozu validate` is removed.
- `hozu check --no-types` covers its use: rules and contracts without tsc.
- `hozu check --update-lock` already exists.
- **Migration:** the step rewrites `"validate": "hozu validate"` scripts in package.json to `hozu check`.
- **Docs and agent files:** they say `check` only.

### C. Warnings that can be accepted
- `project({ accept: [{ code: 'HZ036', at: 'lab.SaveDraft', reason: 'drafts live in localStorage' }] })`.
- An accepted warning does not count. `check` prints `0 errors, 0 warnings (1 accepted)`.
- `at` names the declaration the warning is about; a pointer is accepted too.
- `reason` is required, so the choice is reviewable.
- **Stale entries:** an entry that no longer matches any warning is itself a warning (HZ087 `stale-accept`).
- **Errors cannot be accepted.**

### D. Diagnostics documented from the registry
- **The registry:** each code in `codes.ts` gains `summary` (one line), `fix` (one line) and `topic`.
- **Generated:** `pnpm skill` generates the diagnostics topic and the site's diagnostics table from it.
- **`hozu docs HZ083`** prints one code: summary, typical cause, fix, and the topic to read.
- **A test** fails when a code has no summary or fix, so a new code cannot ship undocumented (the 0.11 HZ081 /
  HZ082 rows were missed by hand).
- **The diagnostic text** of every code is reviewed for the two failure modes the trial found: a fix that
  contradicts the cause, and a fix that suggests silencing.

### E. Shorter guide topics
- **Two parts per topic:**
  - **the shortest correct form**, which `hozu docs <topic>` prints;
  - **more**, which `hozu docs <topic> --more` adds: options, edge cases, history.
- **Target:** what `hozu docs` prints by default is at most half of today's 72.7 KB, with the same tested examples.
  The SKILL.md budget stays at 4 KB.

### F. Fewer inspection commands (deprecation, not removal)
- **`hozu why <symbol | node | page>`** answers in one command what `impact`, `explain` and `locate` answer today:
  - what it is and where it is (file:line);
  - what uses it;
  - what it affects (queries, pages, flows);
  - its transitions and covering contracts, for a state.
- **Deprecation:** `impact`, `explain` and `locate` keep working in 0.14 and print a one-line deprecation pointing
  at `why`. They are removed in 0.15.
- **`graph`** is removed now: an agent reads JSON, not Mermaid. `inspect` and `plan` stay, because they answer
  different questions (raw IR, render plan).

### G. Say why the comparison is with Nuxt
The README, site and trial pages state the setup next to the 1.34–1.72× figure:
- **Nuxt is the model's home ground:** it is in the training data, while Hozu is learned from the guide each
  session.
- **Same model, same spec, same hidden acceptance;** only the framework differs.
- **The cost gap is expected to shrink** once Hozu is known. The correctness gap comes from structure and is not
  expected to shrink.

### H. A trial that separates learning cost (pre-registered, run after 0.14)
- **Write ADR 0055:** pre-register trial 0024 the way ADR 0048 did.
- **The design:** the notes long-run change sequence run in two arms.
  - **A: cold.** Every session learns from the guide, as today.
  - **B: warm.** The guide and the app's map are already in context (cached), simulating a model that knows Hozu.
- **The measure:**
  - A − B is the learning cost;
  - B against Nuxt is the structural cost;
  - correctness is measured as before.
- **The trial runs after 0.14 ships,** so it measures the smaller guide.

### Not in 0.14
- **Declared access** (`query({ access })`): the most valuable next feature, because it makes cross-user data
  leaks hard to write. It is drafted as ADR 0054 for a decision, and built in 0.15 if accepted.
- **`hozu context`, `hozu check --fix`, `hozu errors`, saved flows:** after the trial shows where the remaining
  cost is.

## Migration (0.13 → 0.14)
The step makes three changes:
- it adds `runs: 'either'` where `runs` is omitted (IR unchanged);
- it rewrites `hozu validate` in package.json scripts;
- it removes the `hozu graph` usage it finds in scripts, with a note.

`project({ accept })` is new and optional. The deprecated commands keep working.

## Measure
- **The guide:** `hozu docs` default output ≤ 50 % of 72.7 KB; SKILL.md ≤ 4 KB; the tested examples still pass.
- **Every example** checks with 0 warnings, or with each remaining warning accepted with a reason.
- **Diagnostics:** every code has a registry summary and fix (test). `hozu docs HZ0xx` works for all 81 codes and
  any new ones.
- **Migration:** the 0.10, 0.11 and 0.13 fixtures migrate to 0.14 with an unchanged IR and a clean check.

## Decisions for the owner
| # | Decision | Recommendation |
|---|---|---|
| D1 | `runs` becomes required (breaking; migrate adds `runs: 'either'`) | yes |
| D2 | `hozu validate` removed; `hozu check --no-types` instead | yes |
| D3 | Accepting warnings in `project({ accept })` with a required reason, and HZ087 for stale entries | yes |
| D4 | Diagnostics documented from the registry, and `hozu docs HZ0xx` | yes |
| D5 | Guide topics split into the short form and `--more`, with the default output ≤ 50 % | yes |
| D6 | `hozu why` added; `impact` / `explain` / `locate` deprecated (removed in 0.15); `graph` removed now | yes |
| D7 | README / site explain the Nuxt comparison and the learning cost | yes |
| D8 | Pre-register trial 0024 (cold against warm) as ADR 0055, run after 0.14 | yes |
