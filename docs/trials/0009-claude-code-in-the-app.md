# Trial 0009 — 0.2, measured with Claude Code in the app directory, Nuxt re-run the same way

**Question:** with the 0.2 loop (`hozu check`, `hozu get` / `post`, `hozu add feature`, a leaner skill), what does
the agent cost to build and to change the task board? The measurement is made the way a user works: Claude Code
started in the app, with the skill discovered from the app.

**Targets stated in ADR 0027 before the run:**
- build ≤ 1.3× Nuxt;
- change ≤ 1.1× Nuxt;
- correctness 12/12, 6/6, 12/12.

## Setup
- **How the agent runs:** `claude -p` (Claude Code 2.1.283) in the app directory.
  - `--setting-sources project,local`: the app's `CLAUDE.md` and `.claude/skills/` load, the user's personal
    `~/.claude/CLAUDE.md` does not. A probe run checked this first.
  - `--model claude-opus-5-5`, `--dangerously-skip-permissions`, stream-JSON transcripts.
- **Hozu:** the app was created by the 0.2.0 `create-hozu --agent claude`, from packed tarballs outside the
  repository.
- **Nuxt:** the same blank scaffold as trial 0006 (`bench/trial/nuxt-0006` at its first commit), copied outside the
  repository.
- **Prompts:** the trial 0006 prompts. Hozu's names the app's `CLAUDE.md` for the checks; both add "this is a
  non-interactive run".
- **Metrics:** the weighted formula of the earlier trials (fresh + cached × 0.1 + output × 5), computed from the
  session's final usage.
  - The per-message parser of the earlier trials undercounts output tokens in stream-JSON, so it was not used.
  - The Claude Code harness differs from the subagents of trials 0006–0008. Nuxt was therefore re-run, and only the
    ratios within this trial compare.
- **Record:** the final apps are in `bench/trial/app-0009` and `bench/trial/nuxt-0009`.

## Results
| | Hozu build | Nuxt build | Hozu change | Nuxt change |
|---|---|---|---|---|
| Hidden acceptance | 12 / 12 | 12 / 12 | 6 / 6, regression 12 / 12 | 6 / 6, regression 12 / 12 |
| Turns | 11 | 7 | 15 | 7 |
| Output tokens | 10,311 | 6,362 | 8,200 | 4,238 |
| Fresh input tokens | 44,794 | 16,735 | 36,079 | 16,841 |
| Cached input read | 0.31 M | 0.14 M | 0.45 M | 0.14 M |
| Wall time | 88 s | 73 s | 81 s | 48 s |
| Cost (USD, as reported) | 0.63 | 0.29 | 0.54 | 0.25 |
| Weighted tokens | **127.5 k** | **62.1 k** | **121.9 k** | **52.0 k** |
| App source after the change | 19.0 KB | | | 10.0 KB |

| | Target | Result | Met? |
|---|---|---|---|
| Build | ≤ 1.3× | **2.05×** | no |
| Change | ≤ 1.1× | **2.34×** | no |
| Correctness | 12/12, 6/6, 12/12 | yes, both | yes |

## Where the tokens went
**Hozu build:**
- the skill (loaded as a skill), `reference.md` and the app's files: 21.5 k characters;
- the whole example app: 14.7 k;
- `hozu add feature tasks --page /`, then printing everything it created: 7.9 k.

It then rewrote the scaffolded files for the spec's toggles, filters and detail page, and verified with
`hozu post --next`, including the duplicate title.

**Nuxt build:** read the spec and the scaffold (3.2 k), wrote the pages and API routes, checked, and tried the app
with `curl … | grep`.

**Hozu change:**
- `changing.md` plus the whole app: 18.8 k;
- `grep`s through `reference.md`, `patterns.md` and the example, for how a `<select>` works in a form: 14.2 k.

Then there were two failures.
- **`hozu post` could not select the "Clear done" form.** The page has several forms (add, each toggle, clear). The
  clear form has no fields, and `post` chooses a form by its field names. The agent read `--help`, then started the
  server and used `curl`.
- **The app's `package.json` still scripts `check` as `tsc && hozu validate`**, a leftover of the template.

**Nuxt change:** 7 turns, most of it writing.

## Reading the result
- **The 0.2 loop works as designed.** `hozu check` replaced two commands, and `hozu post --next` verified form
  behaviour, including the duplicate, in one call. The scaffold type-checked and validated at once.
- **It does not change the ratio, because the cost is elsewhere.**
  - The model writes Nuxt from memory: it read 3 k characters before writing.
  - For Hozu it read 30–40 k characters of skill, example and app before writing, and it rewrote most of the
    scaffold because the spec needs more than a list and a form.
- **The earlier ratios do not carry over to this harness.**
  - Trial 0007 measured a change at 1.07× Nuxt.
  - Under Claude Code, Nuxt's own cost fell further than Hozu's (change: 88 k → 52 k), and Hozu's change took 15
    turns because of the form-selection gap.
- **Correctness stayed equal in every step,** as in every trial since 0003.

## Conclusion
- **Measured:** build **2.05×** and change **2.34×** Nuxt, both targets missed, correctness equal.
- **Two defects found in 0.2** (small; they can be fixed before publishing 0.2.0):
  - `hozu post` needs a way to choose a form by its submit button (for example `--button "Clear done"`);
  - the template's `check` script should be `hozu check`.
- **The remaining cost is prior knowledge versus reading.**
  - The skill, the example and a full read of the app are what a model pays for a framework it has not seen.
  - Next candidates:
    - a scaffold closer to common specs (detail page, toggle, filter);
    - recipes in `changing.md` for common changes (a select in a form, an action button);
    - and, as a separate question for the project, how far the authoring surface should move toward shapes models
      already know.
