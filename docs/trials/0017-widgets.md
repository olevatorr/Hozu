# Trial 0017 — a widget-heavy app (Leaflet, Chart.js, GSAP, Three.js)

**Question:** trials 0012–0016 used the notes task: forms, sessions, lists. Does Hozu hold up on an app whose interesting
parts are third-party DOM libraries (a map, a chart, animations, a WebGL globe), where every library goes through
`ui.widget` / `ui.use` / `implement`?

## Setup
- **Task:** `bench/trial/widgets/spec.md`, the City bikes explorer.
  - 8 seeded stations, search, favorites (also without JS), a Leaflet map with markers, a Chart.js bar chart plus a
    table, a GSAP count-up and fade-in (skipped under reduced motion), and a Three.js globe.
  - **Change** (`change.md`): a District `<select>` (also as `/?district=…` without JS), and a Start / Stop tour that
    moves the selection every 1.5 s.
- **Acceptance:** `bench/trial/widgets/accept.mjs`, Chromium with reduced-motion contexts and globe screenshot diffs.
  - W1–W15 check the build; C1–C8 check the change.
  - The reference app `examples/stations` passes 15/15 and 8/8.
- **Runs:**
  - Hozu 0.5.1, packed from the repository;
  - Nuxt 4 with the same prompts;
  - one Codex run on Hozu, with `AGENTS.md`.
  - Model `claude-opus-5-5`.
- **The first attempt was void.** Every Claude run, Hozu and Nuxt, hit the account's session limit mid-task.
  - The Hozu apps were left with the empty client modules written by `hozu add widget`, which first looked like a
    runtime bug.
  - They were reset and re-run with two runs per framework. The Codex run from the first attempt was unaffected and is
    kept.

## Acceptance fixes (before scoring)
All six apps failed the same checks, which pointed at the checks rather than at the apps. The three checks were
rewritten to test what the spec says; the reference app still passes everything.

| Check | Was | Now |
|---|---|---|
| W7 fade-in | the opacity of the region and its ancestors | the opacity from the region's `<h2>` upwards, so a fade on an inner wrapper counts |
| W9 no reload | the URL is unchanged | a window marker survives, so keeping `?q=` in the URL with `replaceState` is allowed |
| C5 tour start | the first sample is the first station | the first *selected* station is the first station; the spec does not say the first step is immediate |

## Results
**Correctness: every run passes everything** after the fixes above.

| | h1 | h2 | Codex | n1 | n2 |
|---|---|---|---|---|---|
| Build (15) | 15 | 15 | 15 | 15 | 15 |
| Change: new (8) | 8 | 8 | 8 | 8 | 8 |
| Change: regression (15) | 15 | 15 | 15 | 15 | 15 |

**Cost (Claude, weighted tokens):**

| | h1 | h2 | Mean | n1 | n2 | Mean | Hozu / Nuxt |
|---|---|---|---|---|---|---|---|
| Build | 373.1 k | 317.8 k | **345.4 k** | 125.5 k | 135.1 k | **130.3 k** | **2.65×** |
| Change | 155.8 k | 236.7 k | **196.2 k** | 49.0 k | 63.7 k | **56.3 k** | **3.48×** |
| Calls, build / change | 34 / 16 | 26 / 22 | | 11 / 7 | 13 / 8 | | |

**Codex (Hozu):**
- Build: 21 commands, 1.30 M input tokens (1.24 M cached), 11.7 k output tokens.
- Change: 13 commands, 0.55 M input tokens (0.51 M cached), 5.2 k output tokens.

## Where the cost went
`bench/trial/anatomy.mjs` shows three parts that the notes task did not have.

**1. Code volume.**
- Output × 5 was 112–117 k per Hozu build, against 66–70 k for Nuxt.
- A widget is three pieces:
  - the declaration with prop and event schemas;
  - a client module;
  - the `ui.use` site.
- On top of that, the machine and a contract for each deciding transition. A Vue component calls the library directly.

**2. Verifying in a browser.**
- `hozu check`, `hozu get` and `hozu post` cover the server and the no-JS paths. They do not run widget code.
- Both Hozu builds wrote their own headless-Chrome script to see markers and canvases.
- No Nuxt run opened a browser.

**3. Three defects found by the runs:**
- **A `fn()` that calls a module-level helper breaks the client silently** (h2 change, about 6 calls, 80 k).
  - `fn` bodies are shipped as source text (ADR 0007 D5), so `matches(…)` is undefined in `fns.js`.
  - On the server everything worked, and `hozu check` was green.
  - The only symptom was an uncaught exception in the browser, which the agent found by driving Chrome over CDP.
  - The rule is written in `hozu docs data`, but nothing enforces it.
- **The favicon.** Without `site.icon` the browser requests `/favicon.ico` and logs a 404 (h1, 4 calls). The agent added
  an endpoint to serve an icon.
- **`hozu add widget` derives the `@hozu/bundle` dependency from the `@hozu/core` spec.**
  - For a `file:` tarball spec this points at the core tarball (h1, 2 calls).
  - Registry versions are unaffected.

Docs reading stayed in the range of trial 0016 (22–118 k carried per run), but it now comes on top of the three parts
above.

## Conclusion
- **Correctness is equal:** 5/5 apps are fully correct, including Codex. Hozu's widget model is sufficient for Leaflet,
  Chart.js, GSAP and Three.js without escape hatches.
- **Cost is not.** On this task Hozu costs 2.65× Nuxt to build and 3.5× to change, against 1.38× / 1.45× on the notes
  task.
  - The gap is mostly structural: code volume and browser verification.
  - Part of it is the three defects, which are fixable.
- **Two runs per framework only.** The spread is large (h2's change was 52 % above h1's), so the ratios are indicative.
