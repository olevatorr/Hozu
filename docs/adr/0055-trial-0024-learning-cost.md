# ADR 0055 — Trial 0024: how much of the cost is learning Hozu? (pre-registration)

- **Status:** accepted and frozen (owner, 2026-10-03): one run per arm, a new sealed held-out set. Not changed after the
  first session starts. ADR 0053 H. It runs on 0.14.0, so it measures the shorter guide.
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
- **Where:** `/Users/otischen/Developer/hozu-trial-0024/` (`TRIAL_ROOT`). Every session gets
  `--settings isolation.json` with `claudeMdExcludes` for the owner's `~/.claude/CLAUDE.md` and `~/CLAUDE.md`, and
  `--setting-sources project,local`, so it sees only the app's own `CLAUDE.md` and skill.
  - A probe session per arm records which instruction files it sees, before step 0.
  - **Found while preparing:** trials 0020 and 0021 ran under `~/` with both of those files loaded in both arms. That
    is a shared confound, and one more reason the Nuxt arm is re-run here.
- **The app:** each arm builds the notes app from `bench/trial/notes/spec.md` (step 0). It then makes the changes
  1–20 in order, each from its own previous step, and then the held-out changes 21–28.
  - **Why from scratch:** trial 0021's step-12 apps and its held-out set were deleted with `~/hozu-trial-0021`; only
    their hashes remain.
  - **Steps 1–20 have been seen.** They were read while 0.8–0.14 were designed. The held-out steps are the ones that
    count for a claim that generalises.
- **The held-out set 21–28 (new):**
  - written by an isolated session that sees only the spec, changes 1–20, the acceptance harness and the Nuxt
    reference, never Hozu, its guide or the research;
  - validated at 100 % on the Nuxt reference, then sealed by SHA-256 in `heldout-0024.sha256`;
  - no check is amended after sealing. The files are copied into the repository after the trial, so they are not
    lost again.
- **Packages:** the 0.14.0 tarballs from `pnpm pack:release` at the release commit, with their SHA-256 recorded.
- **The runner:** `bench/trial/longrun/run.sh` with `ARM` and `SETTINGS`, and `trial-0024.sh` to interleave the
  arms. One `claude -p` session per step and arm, `claude-opus-5-5`, never repaired. A void (a session limit) re-runs
  from the same commit. The arms run step by step: every arm finishes step k before any starts k + 1. Each arm has
  its own port.
- **Arm A (cold):** the skill written by `create-hozu --agent claude`; the agent reads what it chooses.
- **Arm B (warm):** the same skill. In addition, the appended system prompt holds `SKILL.md`, every topic as
  `hozu docs <topic> --more` prints it, and `hozu map` at the start of the step. It is cached from the first call.
  The prompt adds one line: "The Hozu guide and this app's map are already in your context."
- **Arm C (Nuxt):** `bench/trial/nuxt-0006` as in trial 0020, under the same isolation.
- **Acceptance:** the hidden per-step acceptance with every earlier check re-run (`accept.mjs`). Before the runs, it
  is validated on the Nuxt reference for steps 0–20. `hozu check` must be green in arms A and B.
- **Traceability:** per step and arm, the record keeps:
  - the transcript (`NN.jsonl`), the exit code and the attempts;
  - the instruction fingerprints, plus the warm prefix file and its hash;
  - `hozu check` / typecheck / build output, and the acceptance JSON;
  - a metrics row (cost anatomy, lines, diagnostics);
  - a git tag `sNN` in each app.

  `trial-0024.log` records every start, end and void.

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
- **H1, learning dominates:** A / B ≥ 1.25× over the held-out steps 21–28 (and reported for 0–20).
- **H2, little structural cost:** B / C ≤ 1.15× over the held-out steps 21–28 (and reported for 0–20) (B with the prefix's cache reads subtracted).
- **H3, correctness holds:** arms A and B pass every acceptance check of every step, as 0.8 did in trial 0021.
- **Reading the result:**
  - **H1 and H2 hold:** the remaining cost is the price of being new, and the next lever is getting known (examples,
    published apps, documentation that models are trained on).
  - **H1 holds and H2 fails:** the structure costs more than Nuxt even when Hozu is known, and the next release
    targets the code the surface makes an agent write (as 0.7 did).
  - **H1 fails:** the guide is not the main cost; ADR 0053 E is re-examined.
  - **H3 fails:** it is reported first, before any cost figure.

## Budget
- 87 sessions (steps 0–28 × 3 arms), plus the held-out author's session and the probes.

## Result (2026-10-04, `docs/trials/0024-learning-cost.md`)
- **Held out 21–28:**
  - Hozu cold is 1.42× Nuxt;
  - Hozu warm with the preload removed is 1.06×;
  - the learning cost (A / B net) is 1.35×.
- **H1** holds with B net (it fails with B as measured, the cost of carrying a 35 k-token preload). **H2** holds.
  **H3** holds.
- **Correctness:**
  - Both Hozu arms passed every check of every step. Three cold acceptance runs were interrupted by the warm agent's
    `pkill -f "hozu serve"` on the shared machine, and they pass on re-run of the committed code.
  - Nuxt silently broke the export at steps 23–25.
- **Deviations:**
  - `COREPACK_ENABLE_STRICT=0` in the runner, because `~/package.json` names yarn.
  - The held-out author's session ended before its final validation, so the coordinator ran it unchanged (100 %).
  - `accept.mjs` now records the server's exit code, signal and output; pass / fail is unchanged.
- **Replication (not registered):** the held-out steps were run a second time from each arm's step-20 app.
  - The results were 1.32× (A / C), 1.02× (B net / C) and 1.29× (A / B net).
  - Both Hozu arms were 100 % again.
  - Nuxt repeated the same export regression at steps 23–25.
