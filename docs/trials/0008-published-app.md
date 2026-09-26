# Trial 0008 — Build and change an app created from the published 0.1.0

**Question:** can a fresh agent build and change the task board with only what an npm user gets? That means the app
from `npm create hozu@latest --agent claude`, dependencies from the registry, and the `CLAUDE.md` and skill inside
the app. What does it cost against trial 0007 and the same-model Nuxt run?

## Setup
- **Same task, change request, hidden acceptance, model, parser and weighting** as trials 0006 and 0007.
- **The app:** created outside the repository with the published `npm create hozu@latest tasks -- --agent claude`,
  then `npm install` from the registry (`@hozu/*` 0.1.0).
- **Different prompts:**
  - the agent reads the app's `CLAUDE.md` and the skill files in `.claude/skills/hozu/`, instead of loading the
    repository's skill with the Skill tool;
  - it must not read anything in the framework repository (except the task file) or `node_modules/@hozu`;
  - commands use `npx`.
- **Consequence for the measurements:** the skill now arrives as tool output from `cat`, not as a loaded skill. The
  "tool output read" rows are therefore not comparable with trial 0007.
- **Record:** the final app is kept in `bench/trial/app-0008`, formatted, without `node_modules` and the skill copy.

## Results
| | Build 0008 | Build 0007 | Nuxt build | Change 0008 | Change 0007 | Nuxt change |
|---|---|---|---|---|---|---|
| Hidden acceptance | 12 / 12 | 12 / 12 | 12 / 12 | 6 / 6, regression 12 / 12 | 6 / 6, 12 / 12 | 6 / 6, 12 / 12 |
| Assistant turns | 12 | 11 | 6 | 8 | 7 | 8 |
| Tool output read (chars) | 63,865 | 32,322 | 7,790 | 43,198 | 20,417 | 14,629 |
| Output tokens | 11,245 | 9,471 | 6,003 | 7,361 | 4,553 | 4,728 |
| Fresh input tokens | 79,619 | 66,866 | 46,946 | 48,717 | 40,777 | 32,340 |
| Cached input read | 0.69 M | 0.57 M | 0.21 M | 0.40 M | 0.31 M | 0.32 M |
| Weighted tokens | **205 k** | 172 k | 98 k | **126 k** | 94 k | 88 k |
| App source | 15.5 KB | 14.2 KB | 6.9 KB | 19.1 KB | 17.2 KB | 9.2 KB |
| Files touched by the change | | | | 4 | 3 | 6 |

**Ratios against Nuxt:** build **2.09×**, change **1.43×**.

## Where the tokens went
**Build:**
- the app's `CLAUDE.md` and file list: 7.3 k characters;
- `SKILL.md`: 10.4 k;
- the whole example app: 18.5 k;
- `patterns.md` and part of `reference.md`: 9 k;
- one `curl -i` that printed a whole page of HTML: 18.2 k, the agent's own choice.

**Change:** `SKILL.md`, `changing.md` and the whole app read in one command (29.5 k), then `patterns.md` (5.3 k).

## Reading the result
- **Correctness held:** 12/12, 6/6 and 12/12 with only the published artefacts. The npm user's path works end to end.
- **The cost rose against 0007,** mostly for reasons of setup and of the agent's own choices, not of the framework.
  - With the Skill tool, the skill was loaded once into the conversation. Read with `cat`, every file is tool output
    that the next turns carry. The weighted formula counts it again on each later turn, as cached input.
  - About 18 k characters of the build came from one full-page `curl`.
- **What an npm user actually meets is this setup.** Claude Code in the app's directory would discover
  `.claude/skills/hozu/` itself, and load `SKILL.md` as a skill. Only agents that follow `AGENTS.md` read the files.
  The 0008 numbers are closer to the `AGENTS.md` case.
- **The fixed reading cost stays the lever:**
  - `SKILL.md`, the whole example app and `patterns.md` are read before any code is written;
  - the change agent reread the whole skill and the whole app.

## Conclusion
- **Measured:** the published 0.1.0 works for a fresh agent with equal correctness. Build costs 2.09× Nuxt and
  change 1.43×, under a harsher reading setup than trial 0007.
- **Candidates for 0.2** (not decided):
  - point the guide at the one example file a task needs, instead of the whole example;
  - tell agents to check pages with `curl -s … | grep`, not by printing a whole page;
  - run the next trial with Claude Code in the app directory, so the skill loads the way it does for a real user.
