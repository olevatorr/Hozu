# Trial 0016 — 0.5 with the trial 0015 fixes, four runs per step, and a second agent

**Question:** trial 0015 measured the 0.5 build at 1.46× Nuxt, but its change step was noise (one outlier at 177 k),
and it found four sources of friction. After fixing them:
- `&@Button` in `hozu post`;
- comma lists in `--select`;
- a message for a redirected post;
- `patterns` topics that carry their own snippets;

what does 0.5 cost with four runs per step, and does a second agent (Codex) get it right?

## Setup
- **Identical to trials 0014 and 0015:**
  - the notes spec, change request, prompts, model (`claude-opus-5-5`) and hidden acceptance;
  - Nuxt is compared with trial 0012's two runs: build 74.8 k, change 61.1 k. Nuxt was not re-run.
- **Hozu:** four Claude runs on the packed 0.5.0 (19 packages).
- **Codex:** one run with `codex exec -s workspace-write`, in an app created with `--agent agents` (it reads
  `AGENTS.md`), and the same prompts.

## Results
**Correctness: every run passes everything.**

| | h1 | h2 | h3 | h4 | Codex |
|---|---|---|---|---|---|
| Build (15) | 15 | 15 | 15 | 15 | 15 |
| Change: new (6) | 6 | 6 | 6 | 6 | 6 |
| Change: regression (15) | 15 | 15 | 15 | 15 | 15 |

**Cost (Claude, weighted tokens):**

| | h1 | h2 | h3 | h4 | Mean | vs Nuxt | Trial 0014 | Trial 0015 |
|---|---|---|---|---|---|---|---|---|
| Build | 87.5 k | 103.0 k | 101.0 k | 122.1 k | **103.4 k** | **1.38×** | 1.80× | 1.46× |
| Change | 74.5 k | 101.4 k | 82.7 k | 96.7 k | **88.8 k** | **1.45×** | 1.81× | 2.36× |
| Build + change | | | | | 192.2 k | **1.41×** | 1.80× | 1.86× |
| Calls, build / change | 12 / 11 | 20 / 13 | 13 / 10 | 19 / 12 | 16.0 / 11.5 | 6 / 8.5 | 18 / 12 | 16 / 17 |

**Codex:**
- It used 14 commands to build and 14 to change: 638 k and 626 k input tokens, of which 591 k and 579 k were cached,
  and 4.8 k and 4.6 k output tokens.
- Its model and pricing differ, so it is not compared with Nuxt. The point is that a second agent, reading
  `AGENTS.md`, built and changed the app with every check passing.

**Anatomy (`bench/trial/anatomy.mjs`, means, trial 0014 → 0016):**

| | Total | Calls | Output × 5 | Docs, with carry | Docs calls | Read app | Verify calls |
|---|---|---|---|---|---|---|---|
| Build | 134.7 → 103.4 k | 17.0 → 12.5 | 36.5 → 28.2 k | 29.9 → 28.3 k | 5.5 → 3.3 | 14.5 → 8.4 k | 3.0 → 3.3 |
| Change | 110.6 → 88.8 k | 12.0 → 11.0 | 36.3 → 28.4 k | 32.5 → 22.6 k | 4.0 → 3.0 | 4.8 → 4.2 k | 3.5 → 2.5 |

## Reading the result
- **Correctness is unchanged at the top.**
  - That is 180/180 checks across five runs and two agents: isolation, double submit, no-JS forms, `HttpOnly`,
    pinning, in-browser search, and every regression check.
  - Trial 0012's Nuxt run 1 broke three features on the same change.
- **Cost fell on both steps against trial 0014 (0.5 before R1–R3):**
  - build −23 %, change −20 %, together −22 %;
  - build + change is now 1.41× Nuxt, the lowest on this task (trials 0012 2.46×, 0014 1.80×, 0015 1.86×).
- **Where it fell:**
  - fewer calls (a build is 12.5 calls against 17);
  - less output, because assignments and operators are shorter than `op.*`;
  - fewer lookups in the guide;
  - less reading of the scaffold.
- **The docs cost per run is still the largest single part (22–28 k).** Carried through every call, it is what keeps
  Hozu above Nuxt, whose agents read nothing before writing.
- **Four runs per step still vary by about ±15 %.** Trial 0015's change outlier (177 k) came from its own failed
  scripted edit and from the CLI friction fixed here; no run in this trial went above 122 k.
- **Every run still starts a server once at the end.** The prompt offers a port for it, and Nuxt runs do the same.

## Conclusion
- **0.5 (R1–R3 plus the trial 0015 fixes) costs 1.38× Nuxt to build and 1.45× to change,** with every check
  passing for two different agents.
- **The ADR 0038 target (≤ 1.3×) is not met,** but the remaining gap is the guide itself.
- **Measured against 0.4-era Hozu on the same task, an agent now spends about a fifth less.**
