# ADR 0046 — Trial 0022: do agents use 0.9's components? (pre-registration)

- Status: deferred (owner, 2026-10-01): 0.9.0 is released first, and the trial runs after the next feature. The
  design and targets stay as written. They are reviewed and frozen before that run, then not changed after it starts.
- **Why:** ADR 0045 acceptance 6. Phases 0–5 proved that components build the same IR, ship 0 B of JS and are
  checked. They did not prove that an agent uses them.
  - An agent might bypass a kit and hand-write `ui.button` with classes.
  - It might reach for a trailing `!` instead of a variant.
  - The new class rules might cost more than they save.
- **Question:** on the same UI changes to the same existing app, does an agent on Hozu 0.9:
  - put the UI in components;
  - change the look in one place;
  - stay within the cost of Hozu 0.8?

## Options considered
1. **Hozu 0.9 against Hozu 0.8, the same app and the same steps, n = 1 (chosen).**
   - 0.8 is the same framework without components, so a difference is the components' effect.
   - Trial 0021 already measured 0.8 against Nuxt.
2. **Add Nuxt as a third arm.** Rejected: about +50 % tokens for a comparison trial 0021 already made, and Nuxt's own
   component model would measure Vue, not Hozu.
3. **A fresh scaffold.** Rejected: a new app has no repeated UI to consolidate. An existing app shows whether an agent
   moves into a kit or keeps copying classes.
4. **Three runs per arm.** Deferred: n = 1 as in trial 0021's deviation, to keep the cost down. A result near a
   threshold reads as undecided.

## Design
- **The app:** trial 0021's Hozu app at step 28 (`results-0021`, tag `s28` in `~/hozu-trial-0021`), copied to
  `~/hozu-trial-0022`. It has 1 839 lines and a lot of repeated button, input and card markup, and it is 0.8 code that
  passes 80/80.
  - **The 0.9 arm:** the copy upgraded by hand from the CHANGELOG (there is no migration tool). The upgrade's cost is
    reported separately and is not part of step 1.
  - **The 0.8 arm:** the copy unchanged, on the frozen 0.8.0 tarballs.
- **Packages:** 0.9.0 tarballs packed from this branch and frozen before the runs; their SHA-256 is recorded.
- **Everything else as trial 0021:**
  - one `claude -p` session per step, `claude-opus-5-5`, the same runner (`run.sh` with a results root
    `results-0022/`);
  - never repaired between steps;
  - voids re-run from the pre-step commit;
  - instruction fingerprints recorded per step.
- **The prompts never name components, kits, variants or `!`.** They are product requests, so the agent finds the
  mechanism through the skill and the diagnostics, as a user's agent would.

## The eight changes
They are written in product language by an isolated session that sees neither ADR 0045 nor the 0.9 code, in the style
of `bench/trial/longrun/changes/*.md`. Its brief is the list below. Their acceptance checks are browser checks on
computed styles and behaviour, so they are framework-neutral.

| Step | Change (brief for the author) | What it probes |
|---|---|---|
| 1 | Buttons look different from page to page. Make every button follow one style: primary, secondary and a quiet text button. | consolidation into a kit, or not |
| 2 | Inputs and their labels and error texts also follow one style on every form. | a field component, slots |
| 3 | The brand colour changes from indigo to teal on every primary button and focus ring. | change in one place |
| 4 | Delete actions get a red destructive button everywhere. | a new variant |
| 5 | An invalid input shows a red border and its error text until it is fixed. | state through an attribute |
| 6 | On the export page, the download button spans the full width on phones. | layout extension (`class`) |
| 7 | The admin page's "Purge" button needs a one-off look: black, uppercase. | variant vs `!` |
| 8 | A new "Tags" page lists tags with the same buttons, inputs and cards as the rest. | reuse on new code |

- **Validation:** before the runs, a reference implementation of steps 1–8 on each arm passes 100 %. A check that fails
  on both is compared with the change wording first, as in trial 0017.
- **Regression:** the 80 checks of trial 0021 run at every step, on both arms.

## Registered targets
- **Primary:**
  1. Both arms pass every check at every step, new and regression, with no silent introduction (as trial 0021
     counted them).
  2. **Adoption (0.9):** after step 2, at least 90 % of the `button` and `input` elements in the app's views come from a
     `ui.use` of a component, counted in the IR (`use` roots against all `button` / `input` elements). It stays at
     90 % or more through step 8.
  3. **One place (step 3):** the 0.9 arm's diff for step 3 touches at most 1/3 of the lines that the 0.8 arm's diff
     touches.
- **Cost:** the geometric-mean weighted-token ratio, 0.9 / 0.8, over steps 1–8 is at most **1.10×**. Components must
  not make UI work more expensive.
- **Secondary:**
  - trailing-`!` overrides at step 8: at most 2 in the whole app (`hozu check` overrides output);
  - step 7 is solved by a variant or by one `!`; both are allowed, and which one is recorded;
  - raw `ui.button` / `ui.input` with 3 or more classes written by the agent while a kit component exists: 0 after
    step 2;
  - every HZ070–HZ080 the agent meets is fixed in the same step. Each one is reported with its step and how it was
    fixed;
  - the 0.9 arm's lines per change are at most the 0.8 arm's, steps 4–8.
- **Reading:** a target is met or not met as registered. There is no "almost". Unstable metrics are reported, not
  re-run (cost rules).

## Tools
- `metrics.mjs` gains the adoption ratio and the override count from the IR and `hozu check --json`. Each is tested on
  a fixture before the runs.
- `anatomy.mjs` gains a `components` category for `hozu docs components`, `hozu render` and `hozu add kit` /
  `component`, so the report can say what the agent read.

## Budget
- **Weighted tokens:** about 2.5 M for the runs (8 steps × 2 arms, about 150 k per step as in trial 0021) and 1.5 M for
  the change author, the two references and the tools. That is about **4 M** in all, with a **6 M ceiling** that
  stops the trial.
- **Wall clock:** two apps at a time, about 3–4 hours.
- **A cheaper variant (gate T1):** steps 1–4 only, about 2 M. It answers adoption, one place and cost, but not
  overrides, layout or reuse on new code.

## Decisions for the owner
| Gate | Question | Recommendation |
|---|---|---|
| T1 | Eight steps (about 4 M) or the cheaper steps 1–4 (about 2 M) | **eight**: steps 6–8 are where the extension rules and `!` are tested |
| T2 | Upgrade the 0.9 arm's start by hand from the CHANGELOG (also tests the CHANGELOG) | **yes**, and report the cost separately |
| T3 | Release 0.9.0 only after this trial | **yes**: acceptance 6 of ADR 0045 is the trial's |
