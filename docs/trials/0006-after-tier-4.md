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

## Same-model Nuxt run (added after the user approved it)
The first reading of this trial compared the Tenon arm with the Nuxt means of earlier runs. The Nuxt arm was then
re-run the same way:
- same model, same transcript parser;
- a rebuilt blank scaffold (`bench/trial/nuxt-0006`), same prompt structure.

To be fair to Nuxt, the blank scaffold sets `shamefully-hoist=true`. Without it `nuxt typecheck` fails under pnpm
before any code is written; trial 0004's Nuxt agent lost turns to exactly this kind of tooling friction.

| | Tenon build | Nuxt build | Tenon change | Nuxt change |
|---|---|---|---|---|
| Hidden acceptance | 12 / 12 | 12 / 12 | 6 / 6, regression 12 / 12 | 6 / 6, regression 12 / 12 |
| Assistant turns | 8 | 6 | 8 | 8 |
| Shell commands | 6 | 5 | 6 | 7 |
| Tool output read (chars) | 30,670 | 7,790 | 26,836 | 14,629 |
| Output tokens | 10,861 | 6,003 | 7,215 | 4,728 |
| Fresh input tokens | 69,165 | 46,946 | 47,112 | 32,340 |
| Cached input read | 0.39 M | 0.21 M | 0.39 M | 0.32 M |
| Wall time | 90 s | 61 s | 66 s | 57 s |
| Weighted tokens | **163 k** | **98 k** | **122 k** | **88 k** |
| App source | 17.4 KB | 6.9 KB | 21.1 KB | 9.2 KB |
| Files touched by the change | | | 8 | 6 |

**Same-model ratios: build 1.67×, change 1.39× Nuxt.**

## Reading the result
- **The halving of Tenon's change cost is mostly the model.** Nuxt's own costs fell just as much against its earlier
  means: build 205 k → 98 k, change 136 k → 88 k. The first reading (change 0.90×) compared across models and was
  wrong. It is kept above because it was reported before the Nuxt run.
- **Against the same model, Tenon costs more in both steps.** The change premium is smaller than in trial 0005
  (1.9× → 1.4×). The build is worse than trial 0004's 0.8–0.9×: this model builds the Nuxt app in 6 turns without
  the tooling friction earlier Nuxt runs had, while Tenon's fixed cost of reading the skill stays.
- **The cause named in trial 0005 still holds.**
  - The Tenon app is 2.3× the source of the Nuxt app (21.1 KB vs 9.2 KB).
  - A change touches 8 files against 6.
  - The Tenon agents read 2–4× as much tool output: the skill, the reference app, and validator output.
- **Correctness was equal:** every check passed in all four steps.
- **What the framework work of Phases 7–9 changed for agents:** the change agent used the framework's `Invalid`
  and the skill's no-JS form pattern directly, so correctness and turn count held. It did not make the authoring
  surface smaller, which is where the remaining cost is.

## Conclusion
- **Measured:** Tenon costs 1.67× Nuxt to build and 1.39× to change the task board, with the same model, and with
  equal correctness.
- **Direction:** reducing cost now requires a less verbose authoring surface, as trial 0005 concluded. For example:
  - optional fields instead of required `null`s;
  - fewer files per feature;
  - contracts generated from the machine where the transition is unambiguous;
  - a shorter skill.

  This is a design decision for a future ADR.
