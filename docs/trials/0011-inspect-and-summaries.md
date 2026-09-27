# Trial 0011 — 0.3 with `--select` / `--forms` and the scaffold's text list (ADR 0029)

**Question:** do `hozu get --select` / `--forms`, the list of texts printed by `hozu add feature`, and the guidance
"do not print the generated files" lower the agent's cost, compared with trial 0010?

**Targets (ADR 0029, means):**
- build ≤ 1.5× Nuxt;
- change ≤ 1.5×;
- correctness in every run.

## Setup
- **As in trial 0010:** Claude Code in the app directory, the same model, prompts, task, change and acceptance.
  Two Hozu runs per step, from the packed 0.3.0 with ADR 0029.
- **Nuxt was not re-run:** its setup did not change, and trial 0010 ran it twice the same day with the same harness.
  The comparison uses those two runs (build mean 56.5 k, change mean 49.9 k).

## Results
| | Hozu run 1 | Hozu run 2 | Mean | vs Nuxt | Trial 0010 |
|---|---|---|---|---|---|
| Build, acceptance | 12 / 12 | 12 / 12 | | | |
| Build, turns | 16 | 17 | | | 14 / 12 |
| Build, weighted | 134.4 k | 123.5 k | 129.0 k | **2.28×** | 1.64× |
| Change, acceptance | 6 / 6, 12 / 12 | 6 / 6, 12 / 12 | | | |
| Change, turns | 8 | 6 | | | 7 / 6 |
| Change, weighted | 88.5 k | 64.0 k | 76.3 k | **1.53×** | 1.44× |

**Across the four 0.3 runs** (trials 0010 and 0011):
- build **1.96×** Nuxt (110.8 k);
- change **1.48×** (74.1 k);
- correctness in all runs.

## What the agents did
**Build:**
- Both runs used `hozu add feature … --with detail,toggle,filter,remove`, as in trial 0010.
- **Neither followed "do not print the generated files":** run 1 printed `views.ts` in two parts plus `model.ts`
  and `server.ts` (16 k characters); run 2 printed all three with `cat -n` (17.6 k).
- **The extra cost of run 1** came from a mistake: a scripted edit broke the syntax of `views.ts`, and fixing it took
  3 turns. It also removed the starter feature before unregistering it, so the config failed to load once.
- **`--select` and `--forms` were used** to check the filter buttons and the forms. Both runs still started the
  server once at the end, to confirm the 404 status and the `<title>`.

**Change:**
- Both runs read `SKILL.md` with `changing.md` (17 k), then every feature file (14–15 k), then made one edit.
- **Neither used `hozu map`,** which `changing.md` names as the first step.

## Reading the result
- **The new tools work and were used, but they did not replace reading.** The agent reads the code it is about to
  edit, whatever the guide says. Summaries (the text list, `map`) are read in addition to the code, not instead of
  it.
- **Run-to-run variance is large.** One scripted-edit mistake added about 40 k weighted tokens to a build. Two runs
  per arm do not separate an effect of this size from the noise. Trial 0010's 1.64× and this trial's 2.28× are
  better read together (1.96×) than as a regression.
- **The cost that remains is the size of the code an agent reads.**
  - The generated feature (model, views, contracts, resolvers) is about 15 KB, more than the whole Nuxt app
    (9 KB).
  - The contracts and the explicit machine, which are how Hozu checks behaviour, are a large part of it.

## Conclusion
- **Measured:** build 2.28× and change 1.53× Nuxt in this trial; 1.96× and 1.48× across the four 0.3 runs.
  Correctness in every run. The ADR 0029 additions did not measurably lower the cost.
- **They stay in 0.3** as working, tested tools. `--select` / `--forms` remove a reason to start a server, and the
  text list is a correct index.
- **Candidates for the next step** target the size of what is read, not more guidance:
  - put contracts in their own file, so a text or view edit does not load them;
  - shorten the generated code;
  - or, the larger question already raised, move the authoring surface toward shapes models already know.
