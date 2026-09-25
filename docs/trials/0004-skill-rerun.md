# Trial 0004 — Re-running trial 0003 with the Tenon skill (ADR 0013)

This trial repeats trial 0003 after ADR 0013:
- the `tenon` skill, with `examples/bookmarks` as its verified reference app;
- declared `ignore` for busy states;
- DOM text checked by TN033, so a `<select>` can feed an enum field directly.

The spec, the change request, the blank scaffolds, the model and the hidden acceptance are unchanged. The Nuxt
arm was re-run as well, to measure run-to-run variance. The Tenon agents were pointed at the skill first; all
other docs stayed available.

The targets set in ADR 0013, with the stop rule "if the re-run misses the target, stop":
- build ≤ 1.3× Nuxt's tokens;
- change ≤ 1.0× Nuxt's tokens.

## Results
| | Tenon build | Nuxt build | Tenon change | Nuxt change |
|---|---|---|---|---|
| Hidden acceptance | 12 / 12 | 12 / 12 | 6 / 6, regression 12 / 12 | 6 / 6, regression 12 / 12 |
| Assistant turns | **10** (trial 0003: 47) | 25 (20) | 22 (45) | 18 (15) |
| Shell commands | 5 (27) | 13 (11) | 12 (24) | 9 (6) |
| Tool output read (chars) | 43,619 (105,733) | 11,302 (11,484) | 53,777 (45,122) | 15,443 (17,359) |
| Output tokens | 9,766 (21,961) | 11,596 (8,769) | 9,387 (14,943) | 6,083 (5,513) |
| Fresh input tokens | 82,964 (198,017) | 44,290 (39,747) | 75,947 (80,238) | 38,965 (36,456) |
| Cached input read | 0.54 M (3.87 M) | 1.26 M (0.97 M) | 1.32 M (2.80 M) | 0.88 M (0.72 M) |
| Wall time | **85 s** (234 s) | 189 s (120 s) | 99 s (160 s) | 84 s (73 s) |
| App source after the change | 19.7 KB (24.0 KB) | 9.2 KB (11.0 KB) | | |

Token cost can be summarised two ways:
- **Weighted**: fresh input × 1 + cached reads × 0.1 + output × 5, which follows API pricing.
- **Raw**: all tokens processed.

| | Tenon | Nuxt (this run) | Ratio | Nuxt (mean of both runs) | Ratio | Target |
|---|---|---|---|---|---|---|
| Build, weighted | 186 k | 228 k | **0.82×** | 205 k | 0.91× | ≤ 1.3× ✔ |
| Build, raw | 633 k | 1,317 k | 0.48× | 1,170 k | 0.54× | |
| Change, weighted | 255 k | 157 k | **1.62×** | 147 k | 1.74× | ≤ 1.0× ✖ |
| Change, raw | 1,404 k | 923 k | 1.52× | 845 k | 1.66× | |

Compared with trial 0003, Tenon's weighted cost fell **73 %** for the build (695 k → 186 k) and **41 %** for the
change (435 k → 255 k). Nuxt varied by up to ±30 % between its two runs (build output 8.8 k vs 11.6 k), so
single-run ratios carry that much noise.

## Reading the result
- **Build: target met.** With the skill, a fresh agent building a Tenon app is now *cheaper and faster* than
  building the same app in Nuxt.
  - The agent read the skill and the bookmarks example once, wrote the feature in one pass, validated, and
    stopped. It needed 10 turns against Nuxt's 25.
  - Nuxt's agent spent its turns on tooling friction: a missing root tsconfig, how 404 behaves with `createError`,
    and a wrong input pattern.
- **Change: target missed.** A change costs about 1.6–1.7× Nuxt. The causes are structural:
  1. **Every fresh session reads the skill** (about 20 KB). Nuxt's cost for this is zero. On a small change, this
     fixed cost dominates.
  2. **A new field touches more places**:
     - schema, event, effect, machine, view, contracts, feature registration, server and lock in Tenon;
     - shared type, store, API route and two pages in Nuxt.

     The contracts are the price of TN016/TN018. They are the verification Tenon is designed to force.
  3. **A doc gap**: the skill said a `<select>` may feed an enum through `ui.dom.value`, but not that
     `ui.dom.form('name')` does the same for a named select inside the submitted form. The change agent read
     `rules/text.ts` to confirm it. This is fixed in the skill after the measurement, so it did not influence
     the numbers above.
- **Correctness was equal again.** All four arms passed everything. The verification layer did not catch a
  defect that reached acceptance, because none did in either framework.

## Verdict
Tenon now **meets the build target** (0.8–0.9× Nuxt) but **misses the change target** (1.6–1.7× Nuxt).
Under the stop rule agreed before the trial, this direction does not go ahead automatically. Whether to accept
the maintenance premium for the verification, iterate on the change path, or stop is the user's decision.
