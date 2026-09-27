# Trial 0010 — 0.3 (map, composable scaffold, recipes), two runs per arm

**Question:** with `hozu map`, `hozu add feature --with …` and the recipes in `changing.md`, what does the agent
cost against Nuxt under the setup of trial 0009?

**Targets stated in ADR 0028 before the run (means of two runs):**
- build ≤ 1.5× Nuxt;
- change ≤ 1.5×;
- correctness in every run.

## Setup
- **As in trial 0009:**
  - `claude -p` (Claude Code 2.1.283) in the app directory, with `--setting-sources project,local`;
  - `--model claude-opus-5-5`;
  - the same prompts (each run gets its own port), the same task, change and hidden acceptance;
  - weighted tokens computed from each session's final usage.
- **Hozu:** apps created by the 0.3.0 `create-hozu --agent claude`, from packed tarballs outside the repository.
- **Nuxt:** the trial 0006 blank scaffold.
- **Two independent runs per arm and step,** all four in parallel. Each change run starts from its own build.
- **Record:** run 1's final apps are in `bench/trial/app-0010` and `bench/trial/nuxt-0010`.

## Results
**Build:**

| | Hozu run 1 | Hozu run 2 | Nuxt run 1 | Nuxt run 2 |
|---|---|---|---|---|
| Acceptance | 12 / 12 | 12 / 12 | 12 / 12 | 12 / 12 |
| Turns | 14 | 12 | 5 | 7 |
| Output tokens | 5,169 | 5,093 | 5,392 | 6,209 |
| Fresh input | 34,446 | 33,756 | 16,177 | 16,616 |
| Cached input | 0.35 M | 0.31 M | 0.09 M | 0.13 M |
| Weighted | 95.2 k | 90.2 k | 52.1 k | 60.9 k |
| Cost (USD) | 0.45 | 0.43 | 0.26 | 0.28 |

**Change:**

| | Hozu run 1 | Hozu run 2 | Nuxt run 1 | Nuxt run 2 |
|---|---|---|---|---|
| Acceptance | 6 / 6, regression 12 / 12 | 6 / 6, 12 / 12 | 6 / 6, 12 / 12 | 6 / 6, 12 / 12 |
| Turns | 7 | 6 | 6 | 7 |
| Output tokens | 6,745 | 4,502 | 4,195 | 4,333 |
| Fresh input | 29,712 | 24,082 | 16,194 | 16,333 |
| Cached input | 0.19 M | 0.15 M | 0.11 M | 0.14 M |
| Weighted | 82.8 k | 61.2 k | 48.3 k | 51.6 k |
| Cost (USD) | 0.41 | 0.31 | 0.24 | 0.25 |

**Against the targets (means):**

| | Target | 0.2 (trial 0009) | 0.3 (this trial) | Met? |
|---|---|---|---|---|
| Build | ≤ 1.5× | 2.05× | **1.64×** (92.7 k vs 56.5 k) | no |
| Change | ≤ 1.5× | 2.34× | **1.44×** (72.0 k vs 49.9 k) | yes |
| Correctness | every run | yes | yes, 8 of 8 runs | yes |

App source: Hozu run 1 is 16.4 KB, Nuxt run 1 is 9.3 KB.

## Where the tokens went
**Hozu build (both runs):**
- the skill, then the app's files and `patterns.md` (11.9 k characters);
- then `hozu add feature tasks --page / --with detail,toggle,filter,remove`, followed by printing every generated
  file (16.3–16.5 k);
- then small edits to the spec's texts, and `hozu check`;
- then `hozu get` / `hozu post`.

Neither run rewrote the scaffold, which is why output tokens halved against trial 0009 (10.3 k → 5.1 k). Both runs
still started the server once, to check attributes such as `aria-pressed` that `hozu get` does not print.

**Hozu change (both runs):**
- `changing.md` with the app's files (17.1 k);
- then the recipe section and the app's views (12.8–14.1 k);
- then one edit, `hozu check` and a `post` flow.

Run 1 also reread part of a file (7.2 k).

The change went from 15 turns in trial 0009 to 6–7 here, and the server was never started.

## Reading the result
- **The change now costs about what the targets asked for.** The recipes turned the change into one edit, and
  `--button` and `map` removed the detours of trial 0009.
- **The build is close but over.** What remains is reading:
  - the scaffold's output is printed in full to be edited (16 k);
  - the app's own files and `patterns.md` are read before scaffolding (12 k).

  The model writes Nuxt with 3 k of reading.
- **Correctness stayed equal in all eight runs.**

## Conclusion
- **Measured:** build **1.64×** (target missed), change **1.44×** (target met), correctness equal. From 0.2 to 0.3,
  build fell from 2.05× to 1.64× and change from 2.34× to 1.44×.
- **Candidates for the next step** (not decided):
  - `hozu get --attrs` (or a selector), so attributes can be checked without a server;
  - a scaffold that prints a short summary of what it generated instead of prompting a full read;
  - tell agents to skip `patterns.md` when a scaffold part covers the pattern.
