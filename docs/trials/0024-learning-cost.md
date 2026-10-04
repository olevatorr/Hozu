# Trial 0024 — How much of the cost is learning Hozu? (cold, warm, Nuxt; ADR 0055)

**Question:** Hozu costs more tokens per change than Nuxt (1.34–1.72× in trial 0021). ADR 0038 and ADR 0053 put most
of that down to learning: Nuxt is in the training data, while Hozu is read from the guide in every session. Is that
true? How much of the gap is learning, and how much is the structure itself?

**Answer, on the held-out changes:**
- **Hozu as it is today (cold):** 1.42× Nuxt's weighted tokens per change.
- **Hozu once known (warm):** 1.06× Nuxt, after removing what the preloaded guide costs to carry.
- **The learning cost:** cold is 1.35× warm.
- **Correctness:** both Hozu arms passed every check of every step. Nuxt silently broke the export for three steps.

The measured warm arm (1.90× Nuxt, the guide carried in every call) is the price of preloading, not of knowing; see
"How to read the warm arm". These are from the registered run. A second run of the held-out steps gave 1.32×, 1.02× and 1.29× (see "Replication").

## Setup
- **Arms:**
  - **A (cold):** Hozu 0.14.0, the skill from `create-hozu --agent claude`; the agent reads what it chooses.
  - **B (warm):** the same, plus `SKILL.md`, every topic with `--more` and `hozu map` in the appended system prompt
    (about 35 k tokens, cached).
  - **C (Nuxt):** `bench/trial/nuxt-0006`, as in trial 0020.
- **The app:** every arm builds the notes app from `bench/trial/notes/spec.md` (step 0), then makes changes 1–20 in
  order and the new held-out changes 21–28. Each step starts from the arm's own previous step; nothing is repaired.
- **The held-out set:** written and validated by an isolated session that saw the spec, changes 1–20, the harness and
  the Nuxt reference, never Hozu or the research.
  - It was validated at 100 % on the Nuxt reference for all eight steps, and sealed before step 21
    (`bench/trial/longrun/heldout-0024.sha256`).
  - The hashes still matched after the run. The files are now in `bench/trial/longrun/heldout-0024/`.
- **Runner:** one `claude -p` session per step and arm (`claude-opus-5-5`); the three arms ran step by step, in
  parallel, on one Apple M4 Pro (24 GB).
- **Isolation:** `--settings` with `claudeMdExcludes` and `--setting-sources project,local`. A probe confirmed that
  each arm saw only its app's `CLAUDE.md` and skill.
  - The organisation's managed instructions are injected server-side and cannot be excluded. They applied to all
    three arms equally.
  - Trials 0020 and 0021 had the owner's `~/CLAUDE.md` and `~/.claude/CLAUDE.md` loaded in both arms. Their
    numbers are therefore not directly comparable with these.
- **Packages:** the published 0.14.0 tarballs (`5eb3573`, SHA-256 in `hozu-trial-0024/tgz.sha256`).
- **Harness validation:** the acceptance passed 100 % on the Nuxt reference for steps 0–20 before the runs, and for
  21–28 at sealing.
- **Data:** `bench/trial/longrun/results-0024/` (metrics, fingerprints, acceptance JSON); the transcripts stay
  untracked next to them. Table: `node bench/trial/longrun/report-0024.mjs`.

## Results

### Correctness
| | Steps 0–20 | Held out 21–28 |
|---|---|---|
| A, Hozu cold | 100 % every step (two acceptance runs interrupted, see below; 100 % on re-run) | 100 % every step (one interrupted run, 100 % on re-run) |
| B, Hozu warm | 100 % every step | 100 % every step |
| C, Nuxt | 100 % every step | **74/75, 78/79, 80/81 at steps 23–25**, 100 % elsewhere |
| `hozu check` / Nuxt typecheck + build | clean at every step | clean at every step |

- **Nuxt's regression:** at step 23 the agent added the note body to the export, which change 23 did not ask for, so
  the export check (EX1) failed.
  - It failed again at steps 24 and 25, with typecheck and build passing each time.
  - Change 26 then asked for the body in the export, which made the change correct after the fact.
  - Neither Hozu arm touched the export before step 26.
- **Interrupted acceptance runs:** cold steps 12, 20 and 26 first scored 33/50, 5/64 and 7/83.
  - **Cause, from the transcripts and the recorded signal:** at those steps the warm arm's agent finished with
    `pkill -f "hozu serve"`. That stopped every `hozu serve` on the machine, including the cold arm's acceptance
    server (SIGTERM after 14 s at step 26), and the browser session ended with it.
  - The warm agent did this at seven steps. The cold acceptance happened to be running at three of them.
  - No agent's own work was interrupted: no tool result in either Hozu arm shows a refused connection.
  - **Re-running only the acceptance** on the committed code (the tags `s12`, `s20`, `s26`) gave 50/50, 64/64 and
    83/83. Both the raw and the re-run results are kept (`NN.accept-rerun.json`).
  - **Lesson for the harness:** parallel arms on one machine must not share a process name. `accept.mjs` now records
    the server's exit code, signal and output.

### Cost (weighted tokens, geometric mean of the per-step ratios)
| | Steps 0–20 (seen) | Held out 21–28 |
|---|---|---|
| **A / C: Hozu today against Nuxt** | 1.24× | **1.42×** |
| **B net / C: Hozu once known, against Nuxt** | 0.84× | **1.06×** |
| **A / B net: the learning cost** | 1.48× | **1.35×** |
| B / C as measured (the guide carried in every call) | 1.53× | 1.90× |
| Tool calls, A · B · C (total) | 320 · 201 · 239 | 148 · 114 · 86 |

- **Per step** (`report-0024.mjs`):
  - A / C ranges 0.79–2.15×. Held out: 1.18, 1.51, 1.95, 1.43, 2.15, 1.67, 1.05 and 0.90.
  - B net / C ranges 0.53–1.51×.
- **Steps 23 and 24 cost the most in every arm** (a note page with a body; read-only accounts). Hozu cold spent
  286 k on each, against 147 k and 199 k for Nuxt.
- **Warm makes fewer calls:** 201 against 320 on the seen steps, and 114 against 148 held out. Knowing the
  framework removes exploration, not only reading.

### How to read the warm arm
- **The preload:** every warm call carries about 35 k tokens of guide (33.5–36.6 k per step: the first warm call's
  input minus the first cold call's). A model that knew Hozu would not carry them.
- **"B net" removes the preload from each call's usage:** 0.1 × prefix for a call that read it from the cache, and
  1 × prefix for a call that wrote it.
- **This is an estimate.** It assumes the prefix is the whole difference between the first calls, and that knowing
  Hozu brings nothing beyond what the preloaded text gives.
- **"B as measured" is a real cost, not a model of knowing:** loading the whole guide into every session is more
  expensive than letting the agent read what it needs (A / B = 0.75× held out).

## Registered expectations (ADR 0055)
| | Expectation | Result |
|---|---|---|
| H1 | Learning dominates: A / B ≥ 1.25× over 21–28 | **Holds with B net (1.35×).** Fails with B as measured (0.75×), which is the cost of preloading, not of knowing |
| H2 | Little structural cost: B net / C ≤ 1.15× over 21–28 | **Holds (1.06×)** |
| H3 | Arms A and B pass every check of every step | **Holds.** Three cold acceptance runs were interrupted by the harness and pass on re-run; Nuxt regressed at 23–25 |

**Reading (as registered):** H1 and H2 hold, so the remaining cost is the price of being new. Measured against
Nuxt, a known Hozu costs about the same per change and keeps every change correct. The next lever is getting known:
examples, published apps, and documentation that models are trained on. The guide can also keep getting shorter,
because a cold agent still pays 1.35× for it.

## Limits
- **One registered run per arm (and one replication of the held-out steps), and one app.** The per-step ratios scatter widely (0.79–2.15× for A / C). A result within about
  0.1 of a threshold should be read as undecided.
- **"Known" is simulated** by preloading the guide. The net figure is an estimate (see above).
- **Steps 1–20 were seen while 0.8–0.14 were designed.** The held-out steps are the ones that generalise, and they
  are eight.
- **The arms ran in parallel on one machine.** That produced the interrupted acceptance runs; it did not interrupt
  any agent's work.
- **Not comparable with trial 0021.** Different start (built from scratch), different isolation (no owner
  instructions), and a new guide.

## Replication of the held-out steps (run 2)
- **What ran:** after the registered run, each arm made changes 21–28 again from its own step-20 app, with the same
  model and setup (`results-0024-rep2/`).

| Held out 21–28 | Run 1 (registered) | Run 2 | Mean of the two |
|---|---|---|---|
| A / C: Hozu today against Nuxt | 1.42× | 1.32× | 1.37× |
| B net / C: Hozu once known | 1.06× | 1.02× | 1.04× |
| A / B net: the learning cost | 1.35× | 1.29× | 1.32× |
| Tool calls A · B · C | 148 · 114 · 86 | 137 · 116 · 98 | |

- **Correctness repeated exactly:**
  - Both Hozu arms passed every check of every step (`hozu check` clean throughout).
  - Nuxt again added the body to the export at step 23 and failed EX1 silently at steps 23–25. The same
    regression in both runs is behaviour, not chance.
- **Interrupted acceptance runs:** three again (cold 23 and 26, warm 24), each with the same signature: the
  server got SIGTERM while the other Hozu arm's agent ran `pkill -f "hozu serve"`. Re-running the acceptance on the
  committed code gave 75/75, 83/83 and 79/79.
- **Reading:**
  - H2 holds in both runs.
  - H1 holds in both, though run 2 (1.29×) is within 0.1 of the 1.25× threshold.
  - Together, the two runs support the registered reading: the gap is mostly learning, and a known Hozu costs about
    what Nuxt costs.

## Exploratory, not registered: Sonnet 5 on the held-out changes
- **What ran:** after the registered run, the cold Hozu app and the Nuxt app at step 20 (from the Opus run) made
  changes 21–28 again, with `claude-sonnet-5` as the agent. The setup was otherwise the same
  (`results-0024-sonnet/`).
- **Cost:** Hozu was 1.48× Nuxt (geometric mean over 21–28; Opus: 1.42×). Sonnet used about three to four times
  Opus's weighted tokens in both frameworks, and Hozu made 424 calls against Nuxt's 277. The weighting counts
  tokens, not price.
- **Correctness:** both arms missed parts of change 23 and never repaired them:
  - **both:** the body was not shown with its line breaks;
  - **Hozu only:** when the title is a duplicate and the body is too long, only the body message showed. The
    request asks for both messages, with and without JS.
  - Hozu ended at 82/85, Nuxt at 84/85. Nothing that already worked broke in either arm, and `hozu check` was clean
    at every step.
- **Reading:**
  - With a smaller model, the cost gap against Nuxt is about the same.
  - The correctness advantage did not appear: what was missed were details of a new request, which no check of
    Hozu's can see.
  - One run of eight steps: this suggests where to look; it is not a result.
