# Trial 0019 — 0.7 (ADR 0041) on the widget task and the notes task

**Question:** ADR 0041 set targets before the runs. Does 0.7 meet them?
- **What 0.7 changes:**
  - `seed` (a machine's context from the URL);
  - shared `fn` helpers;
  - modules as `declarations`;
  - `machine({ on })`;
  - a shorter `changing.md`.
- **Targets:**
  - widget build ≤ 1.8× Nuxt;
  - widget change ≤ 2.5× Nuxt;
  - notes no worse than trial 0016.

## Setup
- **Unchanged:**
  - the widget task and prompts of trials 0017 and 0018;
  - the notes task and prompts of trial 0016;
  - the hidden acceptance scripts (widgets as corrected in trial 0017);
  - the model, `claude-opus-5-5`.
- **Hozu:** 0.7.0, packed from the repository, two Claude runs per task, all four running in parallel.
- **Nuxt:** not re-run.
  - Widget task: trial 0017, build 130.3 k and change 56.3 k.
  - Notes task: trial 0012, build 74.8 k and change 61.1 k.

## Results
**Correctness: every run passes everything.**
- Widgets: build 15/15, change 8/8 new plus 15/15 regression.
- Notes: build 15/15, change 6/6 new plus 15/15 regression.

**Cost (weighted tokens):**

| | Run 1 | Run 2 | Mean | Before | vs Nuxt | Target |
|---|---|---|---|---|---|---|
| Widget build | 240.8 k | 214.5 k | **227.7 k** | 279.9 k (0018) | **1.75×** (was 2.15×) | ≤ 1.8× — met |
| Widget change | 111.9 k | 116.4 k | **114.1 k** | 195.0 k (0018) | **2.03×** (was 3.46×) | ≤ 2.5× — met |
| Notes build | 79.1 k | 91.5 k | **85.3 k** | 103.4 k (0016) | **1.14×** (was 1.38×) | no worse — met |
| Notes change | 108.2 k | 97.1 k | **102.7 k** | 88.8 k (0016) | **1.68×** (was 1.45×) | no worse — **not met** |

## Reading the result
**The widget apps used every new form without being asked.**
- Both runs wrote a `seed` and a `machine({ on })`, shared at least one module helper between `fn`s, and listed
  `[model, views, widgets]`.
- The `ctx.typed ? ctx.search : search.q` pattern went from 19–23 per app to 0.
- The apps are 660–782 lines, against 852–1100 in trial 0018.
- A change adds 138–204 lines, against 214–529.
- The change step fell 41 %, more than the build. This is what ADR 0041 expected: the URL filter and the mode are
  now one place to edit, not seven.

**The notes change got worse, and the cause is E.**
- Both 0.7 runs read the `data` and `contracts` topics as well, and one also read `machine`. Trial 0016 read at most
  `patterns`, `data` and `testing`.
- The pin request is a per-item server action. The old `changing.md` answered it inline (the event, the mutation, a
  busy state, "no contract needed"). After E moved the recipes to `hozu docs recipes`, neither run opened that topic;
  they reconstructed the answer from three topics.
- Trial 0016's four runs spread from 74 k to 101 k, so two runs at 97 k and 108 k are partly noise. The extra docs
  calls are not noise.
- **Fix:** `changing.md`'s table has a row for a per-item action stored on the server, with the steps and the contract
  answer. The file is 3.4 KB, against 5.6 KB before 0.7.

## Re-run of the notes change with the fix
- **Setup:** both notes apps were reset to their build commit, `changing.md` was replaced, and the same change prompt
  ran again.
- **Result:** 91.1 k and 77.1 k, mean **84.1 k = 1.38× Nuxt** (trial 0016: 88.8 k, 1.45×). Every check passes (6/6
  new, 15/15 regression).
  - Calls: 12 and 10.
  - Neither run read the `contracts` topic. One read `data` and the other `machine`, besides `SKILL`, `changing` and
    `patterns`.

## Conclusion
- **The widget targets are met,** build at 1.75× and change at 2.03× Nuxt (from 2.65× / 3.48× at 0.5.1), with every
  check passing.
- **The notes build improved to 1.14×.**
- **The notes change first regressed to 1.68×,** because a recipe left the file every change reads.
- **With that row back in `changing.md`, the re-run is 1.38×.** That is below trial 0016, so every ADR 0041 target is
  met:

| | Nuxt ratio before 0.7 | 0.7 |
|---|---|---|
| Widget build | 2.15× | 1.75× |
| Widget change | 3.46× | 2.03× |
| Notes build | 1.38× | 1.14× |
| Notes change | 1.45× | 1.38× |
