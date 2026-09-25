# Trial 0005 — The change path after ADR 0013 iteration 2

This trial re-ran only the change step of trial 0004. Both arms started from their trial-0004 build snapshots,
with fresh agents and the same change request and hidden acceptance.

The Tenon side had two changes since trial 0004:
- the skill is split by task (`SKILL.md` core, plus `changing.md`, `patterns.md` and `diagnostics.md`);
- TN016 prints contracts filled from the declarations.

## Results
| | Tenon change | Nuxt change |
|---|---|---|
| Hidden acceptance | 6 / 6, regression 12 / 12 | 6 / 6, regression 12 / 12 |
| Assistant turns | 21 (trial 0004: 22) | 12 (18) |
| Shell commands | 13 (12) | 6 (9) |
| Tool output read (chars) | 52,009 (53,777) | 14,632 (15,443) |
| Output tokens | 8,613 (9,387) | 5,497 (6,083) |
| Fresh input tokens | 89,606 (75,947) | 31,805 (38,965) |
| Cached input read | 1.23 M (1.32 M) | 0.57 M (0.88 M) |
| Wall time | 94 s (99 s) | 78 s (84 s) |
| Weighted tokens (input × 1 + cache × 0.1 + output × 5) | **255 k** (255 k) | 116 k (157 k) |

Nuxt's change step across its three runs cost 136 k, 157 k and 116 k weighted, a mean of 136 k. Tenon's change
step therefore costs **about 1.9× Nuxt** (2.2× against this run).

## Findings
- **Iteration 2 had no measurable effect.** The change agent read `SKILL.md` and `changing.md` and followed the
  recommended order. It still wrote the contracts by hand, so it never used the TN016 snippets. Turns, reading
  and output were within the noise of trial 0004.
- **Reading the skill is not the main cost.** What dominates is the size of the app the agent must read and
  edit, and the number of places a change touches:
  - The Tenon app is about 2× the source of the Nuxt app (15.8 KB vs 7.1 KB before the change).
  - A new field and a new action touch 9 files in Tenon against 5 in Nuxt, and each extra edit turn re-reads a
    larger context.
- **Correctness stayed equal** in every run of both arms.

## Conclusion
- **Build**: Tenon with the skill is cheaper than Nuxt (0.8–0.9×, trial 0004).
- **Change**: Tenon costs about 1.9× Nuxt. The premium is structural: the verbosity of the authoring surface
  and the number of declaration sites. Better docs do not remove it.
- **Further reduction** would need a less verbose view and declaration surface (for example fewer files per
  feature, or shorter builders). That is a design decision for a later ADR.
- **Next step**: the user approved continuing after this experiment, so Phase 6 (ADR 0011, Tier 1) proceeds.
