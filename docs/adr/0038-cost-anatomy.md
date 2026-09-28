# ADR 0038 — Where an agent's cost goes (a study of trials 0009–0014)

- Status: accepted. The owner chose R1 + R2 + R3 for 0.5; the results are below.
- Motivation: every release since ADR 0022 changed something, and trials 0007, 0009, 0011 and 0014 each reported
  the same finding: the cost is reading.
  - None of those releases had a model of the cost to check the change against.
  - 0.5 lowered what agents write, and trial 0014 showed that writing was not the gap.

## Method
`bench/trial/anatomy.mjs` reads a `claude -p --output-format stream-json` transcript. Weighted tokens are
`fresh + cached × 0.1 + output × 5`, as in every trial. It splits them in two ways.
- **By component,** from the run's final usage:
  - fresh input;
  - cached input × 0.1, which is the context that every call carries again;
  - output × 5, which includes thinking.
- **By source.**
  - **What it measures:** the tokens a call adds to the context (its `cache_creation_input_tokens`) come from the
    previous call's tool result and output. They are charged to that call's activity, with their carry: they cost
    once, then 0.1 on every later call.
  - **Activities:**
    - docs: the skill, guides, `--help`, `map` / `inspect` / `explain`;
    - spec;
    - read: app files;
    - scaffold;
    - edit;
    - check;
    - verify: `get` / `post`, `curl`, a server;
    - start: the harness prompt, before the first call.

Data: every transcript kept (Hozu: 11 builds, 9 changes; Nuxt: 5 builds, 5 changes) on the task board (trials
0009–0011) and the notes app (0012–0014), same model and prompts.

## Findings
**Means per group (weighted tokens):**

| | Total | Fresh | Cached × .1 | Output × 5 | Calls |
|---|---|---|---|---|---|
| Hozu build, board | 114.2 k | 38.4 k | 41.7 k | 34.0 k | 12.2 |
| Nuxt build, board | 58.3 k | 16.5 k | 11.9 k | 29.9 k | 6.3 |
| Hozu build, notes | 155.9 k | 43.8 k | 65.1 k | 47.1 k | 17.0 |
| Nuxt build, notes | 74.8 k | 21.8 k | 11.7 k | 41.3 k | 6.0 |
| Hozu change, board | 83.7 k | 29.2 k | 23.4 k | 31.1 k | 8.0 |
| Nuxt change, board | 50.6 k | 16.5 k | 12.9 k | 21.3 k | 6.7 |
| Hozu change, notes | 118.2 k | 35.9 k | 42.8 k | 39.5 k | 12.8 |
| Nuxt change, notes | 61.0 k | 18.1 k | 17.8 k | 25.2 k | 8.5 |

**Cost by source, with carry (means):**

| | start | docs | read app | scaffold | edit | verify | check |
|---|---|---|---|---|---|---|---|
| Hozu build, notes | 42.4 k | **42.8 k** | 9.3 k | 2.7 k | 12.9 k | 5.1 k | 1.0 k |
| Nuxt build, notes | 24.4 k | 0 | 2.2 k | 0 | 7.9 k | 1.6 k | 0 |
| Hozu change, notes | 35.4 k | **38.9 k** | 2.8 k | 0 | 6.4 k | 3.8 k | 0.2 k |
| Nuxt change, notes | 28.4 k | 0 | 6.7 k | 0 | 5.6 k | 0.5 k | 2.5 k |
| Hozu build, board | 35.9 k | **27.5 k** | 7.1 k | 6.8 k | 6.6 k | 1.9 k | 1.6 k |
| Hozu change, board | 28.7 k | **21.7 k** | 1.5 k | 0 | 7.5 k | 1.7 k | 0.4 k |

1. **Documentation is the largest single cost.**
   - It is 22–43 k per run, and Nuxt's is zero.
   - That is 45–75 % of the gap to Nuxt: build notes 43 of 81 k, change notes 39 of 57 k, build board 28 of 56 k,
     change board 22 of 33 k.
   - It is also the most frequent activity: about 5 of 17 calls in a notes build are lookups in the guide.
2. **The number of calls multiplies everything else.**
   - `start` is the same prompt for both (16.3 k), but it costs 18 k more in a Hozu build, only because it is carried
     through 17 calls instead of 6.
   - Each lookup call adds its own content and carries all earlier content once more.
3. **Writing is not the gap.** Output × 5 is about equal on builds (47 k against 41 k on notes; 34 k against 30 k
   on the board). 0.5's "less to write" targeted a component that was already at parity.
4. **Reading the app is small.**
   - It is 2–9 k, and in changes Nuxt reads *more* app code than Hozu (6.7 k against 2.8 k).
   - The file layout (ADR 0022's two files, or any other split) is not a cost driver. An earlier estimate in this
     project, that the app's own code costs 10–20 k per run, counted characters, not carried tokens.
5. **The source is larger** (the notes app: Hozu 19–21 KB against Nuxt 11–13 KB), but agents mostly generate it
   (`hozu add`) and rarely re-read it whole, so size costs agents little. It costs a human reader more.

## What this means
- **The documentation is the cost of Hozu being unfamiliar.** It exists to teach what differs from what a model
  already knows:
  - references are recorded, not evaluated;
  - logic is `op.*` and `fn()`;
  - one machine, `invoke` for effects;
  - contracts.
- **Every rule that departs from ordinary TypeScript costs twice.** It costs once as documentation to read, and
  again as the lookup calls that carry it.
- **So "counter-intuitive" is not a separate problem from cost; it is its main cause.**
- **Verbosity is a smaller problem for agents than for people.**

## Options
- **R1. Less documentation per task, found in one step.**
  - `SKILL.md` becomes a short core plus a task index.
  - Task-sized topics are printed by `hozu docs <topic>`.
  - Diagnostics and `hozu add` name the topic to read.
  - **Aim:** halve the docs cost (about −20 k per run, about 25 % of the gap).
  - **Scope:** it changes no API.
- **R2. Fewer calls.**
  - One command verifies a flow end to end (`hozu get` / `post` already do most of it); the guides stop sending
    agents to a server.
  - Checks that pass the first time: HZ015's message for `effects` shows the expected list to paste.
  - **Aim:** about 3 calls fewer per run.
- **R3. Ordinary TypeScript in builder callbacks** (the counter-intuitive rules).
  - **What authors write:** `a === b`, `x ? A : B`, `x && A`, template strings, `.filter` / `.map` on references,
    and `ctx.x = v` in `assign`.
  - **What it becomes:** a source transform turns them into the IR that `op.*`, `ui.if` and `fn()` produce today. The
    IR, the validator and the runtime do not change.
  - **Effect:** it removes the largest block of rules from the guide, HZ044's category, and most of the extra source.
  - **Cost:**
    - a JavaScript parser, because TypeScript 7 has no JavaScript API. That is a new third-party dependency, an
      exception to the zero-dependency rule, like `@hozu/css` and `@hozu/bundle`;
    - a module hook everywhere feature files load (`node serve.ts`, tests, `hozu build`, the edge path through
      `hozu build`);
    - every diagnostic must still map back to the author's line.
  - **Size:** weeks of work, a new authoring surface to document, and a migration.
  - **Principle check:**
    - principle 2 holds if the transform is deterministic and visible (`hozu explain` shows the IR it produced);
    - principle 1 needs a choice: the `op.*` forms either go, or stay as the lowered form that is never written by
      hand.

## Result
Trials 0015 and 0016 ran on the same notes task, prompts and model as trial 0014.
- **Trial 0016** used four Claude runs per step, after the trial 0015 fixes.
  - **Cost:**

    | | Before (0.5 without R1–R3, trial 0014) | After (trial 0016) |
    |---|---|---|
    | Build | 1.80× Nuxt | **1.38×** |
    | Change | 1.81× Nuxt | **1.45×** |
    | Together | 1.80× Nuxt | **1.41×** |
  - **Correctness:** 180/180 checks, including one Codex run reading `AGENTS.md`.
- **Where it fell:**
  - calls: 17 → 12.5 per build;
  - output: −23 %, because operators and assignments are shorter than `op.*`;
  - guide lookups: 5.5 → 3.3 calls per build;
  - reading the scaffold: 14.5 → 8.4 k.
- **The ≤ 1.3× target is not met.** The carried docs cost (22–28 k per run) is still the largest single part.
