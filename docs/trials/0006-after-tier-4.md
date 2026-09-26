# Trial 0006 — Build and change after Tiers 2–4 (Phases 7–9)

**Question:** after the Tier 2–4 phases (ADR 0015–0021), what does a fresh agent pay to build and to change the
task board in Tenon?

**Expectation stated before the run:** no improvement on the change. The phases added features, not a shorter
authoring surface, and they added five required fields (`http`, `env`, `messages`, `site.locales`,
`site.offline`).

## Setup
- **Same task, change request and hidden acceptance** as trials 0003–0005 (`bench/trial/spec.md`, `change.md`,
  `accept.mjs`).
- **Tenon arm only.** By the user's choice, the Nuxt figures are the means of its earlier runs:
  - build 205 k weighted;
  - change 136 k weighted.
- **Starting point:** a blank, working scaffold rebuilt for this run (`examples/trial-0006` at its first commit).
  The earlier scaffold was not kept.
- **Agents:** a fresh agent per step, told to load the `tenon` skill first, and not to read
  `examples/trial-tasks`, `bench/trial` (except its task file) or `docs/trials`.
- **Metrics:** computed from the agents' transcripts. Per message the maximum usage is taken, because streamed
  records repeat. Weighted cost is fresh input × 1 + cached reads × 0.1 + output × 5, as before.
- **Environment:** local macOS. The model is the one running this session. Earlier trials ran in a cloud
  environment, possibly with another model.

## Results
| | Tenon build | Tenon change |
|---|---|---|
| Hidden acceptance | 12 / 12 | 6 / 6, regression 12 / 12 |
| Assistant turns | 8 (trial 0004: 10) | 8 (0005: 21) |
| Shell commands | 6 (5) | 6 (13) |
| Tool output read (chars) | 30,670 (43,619) | 26,836 (52,009) |
| Output tokens | 10,861 (9,766) | 7,215 (8,613) |
| Fresh input tokens | 69,165 (82,964) | 47,112 (89,606) |
| Cached input read | 0.39 M (0.54 M) | 0.39 M (1.23 M) |
| Wall time | 90 s (85 s) | 66 s (94 s) |
| Weighted tokens | **163 k** (186 k) | **122 k** (255 k) |
| App source (all `.ts`) | 17.4 KB | 21.1 KB after the change |

**Ratios against the Nuxt means:** build **0.79×** (trial 0004: 0.82–0.91×), change **0.90×** (trials 0004/0005:
1.6–1.9×).

## Reading the result
- **Correctness:** all checks passed in both steps, as in every earlier trial.
- **Build** is in line with trial 0004, slightly cheaper.
- **Change** fell by half (255 k → 122 k), against the expectation. The agent needed 8 turns instead of 21, and read
  half as much tool output. Nothing in the transcript metrics points to a single cause. Three candidates:
  1. **The model.** The earlier runs may have used another model. This is the strongest candidate, and this trial
     cannot separate it from the framework.
  2. **Framework help added since:**
     - `Invalid` fields: the agent used the framework error for an invalid priority instead of writing its own;
     - the skill's patterns for no-JS forms: the agent put `Clear done` in its own form without trial and error;
     - TN016 contract skeletons.
  3. **Measurement.** The weighted formula is the same, but the transcript parser is new. A systematic difference
     from the earlier tool cannot be excluded.
- **The files a change touches did not shrink:** 8 files changed, as before. The structural premium named in
  trial 0005 is still there in the code. It no longer shows up in the cost of this run.

## Conclusion
- **Measured:** building and changing the task board in Tenon cost 163 k and 122 k weighted tokens, with every
  check passing.
- **Not established:** that Tenon's change cost is now below Nuxt's. Only a same-model, same-parser Nuxt run can
  show that.
- **Proposed next step:** re-run the Nuxt arm (build and change) the same way, which costs about 0.35 M weighted.
  After that, the ratio can be stated.
