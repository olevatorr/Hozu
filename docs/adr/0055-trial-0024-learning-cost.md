# ADR 0055 — Trial 0024: how much of the cost is learning Hozu? (pre-registration)

- **Status:** proposed (2026-10-03), ADR 0053 H. The trial runs after 0.14.0 is released, so it measures the shorter
  guide. The design and targets are reviewed and frozen before the run, then not changed after it starts.
- **Why:** trial 0021 measured 1.34–1.72× Nuxt per change on the long run.
  - ADR 0038 and ADR 0053 attribute most of that to learning: Nuxt is in the training data, while Hozu is read from
    the guide in every session.
  - That attribution has not been measured directly. If it holds, the gap closes once models know Hozu. If it does
    not, the cost is in the structure, and the guide is not the lever.
- **Question:** on the same changes to the same app, how does the cost of an agent that learns Hozu from the guide
  (cold) compare with one that already has the guide and the app's map in context (warm)? How do both compare with
  Nuxt?
  - **cold − warm** is the learning cost;
  - **warm against Nuxt** is the structural cost;
  - correctness is measured in every arm, as before.

## Options considered
1. **Warm = the guide and the map preloaded into the cached system prompt (chosen).** It is the closest available
   stand-in for a model that knows Hozu, and only the starting context differs between the arms.
2. **Fine-tune a model on Hozu.** Rejected: it is out of reach, and it would change the model between the arms.
3. **Warm = a session that has already done the previous step (one long session).** Rejected: the arms would also
   differ in the conversation history and in compaction, not only in what is known.
4. **A warm Nuxt arm with the Nuxt docs preloaded.** Not done: the training data already plays that role for Nuxt,
   and preloading would test the docs, not the framework.
5. **Three runs per arm.** Deferred to keep the cost down; a result near a threshold reads as undecided.

## Design
- **The app:** trial 0021's Hozu app at step 12 (`s12m`), migrated to 0.14 with `hozu migrate`, with an equal IR and
  a clean check; copied to `~/hozu-trial-0024`. The 0.14.0 tarballs are packed from the release commit, and their
  SHA-256 is recorded.
- **The changes:** steps 13–28 of the notes long run: 13–20 as in trial 0020, and 21–28 the sealed held-out set
  (`bench/trial/longrun/heldout.sha256`). The changes are cumulative, as in trial 0021: each arm continues from its
  own previous step.
- **The runner:** one `claude -p` session per step and arm, `claude-opus-5-5`, the same runner as trial 0021
  (`bench/trial/longrun/run.sh`), instruction fingerprints recorded; never repaired; a void re-runs from the same
  copy.
- **Arm A (cold):** as trial 0021. The skill is written by `create-hozu --agent claude`, and the agent reads what it
  chooses.
- **Arm B (warm):** the same skill. In addition, `SKILL.md`, every topic printed with `hozu docs <topic> --more`, and
  the output of `hozu map` at the start of the step are put in the appended system prompt, so they are cached from the
  first call. The prompt adds one line: "The Hozu guide and this app's map are already in your context."
- **Arm C (Nuxt):** trial 0020's Nuxt app at step 12, re-run at the same time as the drift control.
- **Acceptance:** the hidden per-step acceptance and regression pass of trial 0021, unchanged; `hozu check` must be
  green in arms A and B.

## Measures
- **Cost:** weighted tokens and tool calls per step, the same weighting as trial 0021.
  - Arm B's preloaded prefix is read from the cache on every call. A model that knew Hozu would not pay that read.
  - Arm B is therefore reported twice: as measured, and with the preloaded prefix's cache reads subtracted.
- **Learning cost:** the geometric mean over steps of A / B.
- **Structural cost:** the geometric mean over steps of B / C, using both B figures.
- **Correctness:** checks passed per arm and step, and the regressions found after a step had passed.
- **Secondary:**
  - tool calls spent reading the guide or source before the first edit;
  - `hozu docs` calls, with and without `--more`;
  - every diagnostic met, with how it was fixed;
  - wall time.

## Registered expectations
These are the hypotheses the trial tests. They are not targets that a release has to meet.
- **H1, learning dominates:** A / B ≥ 1.25× over steps 13–28.
- **H2, little structural cost:** B / C ≤ 1.15× over steps 13–28 (B with the prefix's cache reads subtracted).
- **H3, correctness holds:** arms A and B pass every acceptance check of every step, as 0.8 did in trial 0021.
- **Reading the result:**
  - **H1 and H2 hold:** the remaining cost is the price of being new, and the next lever is getting known (examples,
    published apps, documentation that models are trained on).
  - **H1 holds and H2 fails:** the structure costs more than Nuxt even when Hozu is known, and the next release
    targets the code the surface makes an agent write (as 0.7 did).
  - **H1 fails:** the guide is not the main cost; ADR 0053 E is re-examined.
  - **H3 fails:** it is reported first, before any cost figure.

## Budget
- 48 sessions (16 steps × 3 arms), plus the migration check.
- That is about twice the cost of trial 0021's sixteen Hozu steps. Arm B's prefix is cached, so its calls cost less
  per call.
