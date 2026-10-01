# ADR 0044 — Trial 0021: pre-registration for 0.8

- Status: accepted with ADR 0043 (gate G12). Written before any 0.8 code; the targets below are not changed after the
runs start.
- **Deviation (owner, 2026-10-01, after the first pair started):** one run per framework instead of three, and no short
variant, so that feature work can start. The targets are unchanged; the report states n = 1, treats a result near a
threshold as undecided, and run 2's `s12m` (tagged) stays ready for a later second and third run.
- Question: does Hozu 0.8 remove what trial 0020 measured? Concretely:
  - the silent regressions;
  - the cost that grew with each change;
  - the fixed cost of a change, when the same notes app keeps changing?
- It also re-tests ADR 0042's thesis ("AI-generated codebases degrade more slowly under Hozu") on changes that nobody
designing 0.8 has seen.

## Variants


| Variant | Hozu                                                                      | Nuxt                                                                                                   | Steps                 |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------- |
| Primary | `s12m` of trial 0020 run 1 and run 2, and a third run from run 1's `s12m` | its own `s12` of run 1 and run 2, and a third run from run 1's `s12`, at the same time (drift control) | 13 → 20, then 21 → 28 |
| Short   | a fresh `create-hozu` 0.8 scaffold, 2 runs                                | trial 0020's Nuxt steps 0–7 (same Nuxt, prompts and acceptance)                                        | 0 → 7                 |


- `**s12m`:**
  1. `hozu migrate 0.8` on `s12`;
  2. the owner's written review of every entry that was already stale under 0.7 (recorded in the trial report);
  3. `hozu check --update-lock`;
  4. commit and tag `s12m`.
    - The start criterion is `hozu check` with 0 errors.
    - The HZ058 list is recorded as the baseline, not required to be empty.
    - The migration's own cost is reported separately and is not part of step 13.
- **Everything else as trial 0020:**
  - one `claude -p` session per step, `claude-opus-5-5`, with the prompts in `bench/trial/longrun/prompts/`;
  - never repaired between steps;
  - voids re-run from the pre-step commit.
- **Runner:** `run.sh` gains a start tag and a results root (`results-0021/`); 0.8 apps start with `hozu serve`.

## Held-out changes 21–28

- **Author:** a fresh agent session outside the repository. Its only inputs are:
  - `bench/trial/notes/spec.md`;
  - `bench/trial/longrun/changes/01.md … 20.md`;
  - the `accept.mjs` check API (the `check()` registry and its helpers, not the checks);
  - this brief: realistic product changes of rising reach on the app after step 20, expressible in both frameworks
  without new dependencies, written as behaviour and DOM contracts in the style of the earlier changes.
  - It must not read `packages/`, ADR 0043, the research, or the trial results.
- **Output:**
  - `changes/21.md … 28.md`;
  - `accept-heldout.mjs`, whose checks `accept.mjs` loads for steps ≥ 21.
  - Both are kept outside the repository (`~/hozu-trial-0021/heldout/`), and only their SHA-256 is committed in wave 0.
- **The research drafts of 21–28 are discarded.**
- **Validation:**
  - The Nuxt reference implements 21–28 before the freeze. That worker does not touch 0.8.
  - The Hozu reference implements them after the 0.8 tarballs are frozen.
  - Every step must pass 100 % on both before any trial run. A check that fails on both is compared with the change
  wording first, as in trial 0017.

## Measurement tools (v2)

- **Written in wave 0; frozen after wave 4,** once the 0.8 CLI surface exists. Trial 0020 is then rescored with the
frozen tools as the baseline.
- `**anatomy.mjs`:**
  - the verify category includes `hozu browse`, CDP probes and python HTTP probes;
  - the primary verify metric is calls that verify or serve;
  - the categorisation reads the leading command of a pipeline.
- `**metrics.mjs`:**
  - HZ018 and HZ057 are counted from diagnostics, not from text;
  - the lock metrics are new copy-only entries never committed, and behaviour changed without a contract change;
  - silent failures are counted as introductions and reviewed by hand. The keyword heuristic is kept only as a hint.
- `**accept.mjs`:**
  - B3 checks two values without JS;
  - G2 checks the list with JS;
  - a DA1 twin without JS is the control;
  - N16 checks that the text after each JS link equals a no-JS GET of the same URL. It excludes C's documented 400.
- **Mutation tests:** 1–2 planted defects each for D3, D4, D7 and D9, applied to a copy of the migrated reference app.
  - Recall is measured for `hozu check` and for one `hozu browse --js both` chain.
  - 0.7 is expected to catch 0; this is confirmed when the mutations are written.
- **Recorded per run:** the SHA-256 of the managed instructions, `~/.claude/CLAUDE.md`, the app's `CLAUDE.md` and the
skill, frozen for the trial.

## Registered targets

- **Primary** (all three runs, steps 13–28):
  1. no regression failure and no silent introduction;
  2. the geometric-mean cost ratio Hozu / Nuxt over steps 13–20 is at most **1.8×**, pooled over the runs.
    - 0.7: 2.64× / 2.73×, pooled 2.68×.
    - 0.7 over steps 1–12: 1.68× / 1.79×.
- **Secondary:**
  - step 13 ≤ 2× Nuxt (0.7: 8.9×);
  - step 14 ≤ 1.25× (0.7: 1.59×);
  - step 19 ≤ 1.4× (0.7: 2.19×);
  - step 18 ≤ 1.3× its neighbours' mean (0.7: 2.65× / 2.06×);
  - no hand-written HTML endpoint in step 16;
  - mutation recall 100 % for 0.8.
- **Thesis:** the OLS slope of log(Hozu / Nuxt) over steps 13–28, pooled, is ≤ 0. The held-out steps 21–28 are
reported separately.
- **Short variant:** steps 1–7 at most 1.3× trial 0020's Nuxt, and no contract that HZ058 flags written by the agent.
- **Reading:** a target is met or not met as registered. Unstable metrics are reported, not re-run (cost rules). There
is no "almost".

## Budget

- **Weighted tokens:** about 18 M required, 25 M ceiling (gate G12).
- **Wall clock:** two apps at a time, as in trial 0020: about 10–14 hours for the primary variant and 1–2 hours for the
short one.

