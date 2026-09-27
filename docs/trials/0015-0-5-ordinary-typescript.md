# Trial 0015 — The notes app on 0.5 with ordinary TypeScript and an indexed guide (ADR 0038, 0039)

**Question:** trial 0014 left the cost at 1.80× Nuxt to build and 1.81× to change, and ADR 0038 traced most of the
gap to reading the guide. After R1 (an indexed guide and `hozu docs`), R2 (fewer calls) and R3 (ordinary TypeScript),
does the cost fall, and does correctness hold?

## Setup
- **Identical to trial 0014:**
  - the same spec, change request, prompts, model (`claude-opus-5-5`) and acceptance;
  - Nuxt is compared with trial 0012's runs: build 74.8 k, change 61.1 k.
- **Hozu:** two runs on the packed 0.5.0, 19 packages including `@hozu/transform`.
- **The Codex run is void again:** it hit its usage limit ("try again at 3:55 AM") before its first command.

## Results
**Correctness:**

| | Hozu run 1 | Hozu run 2 |
|---|---|---|
| Build (15 checks) | 15 | 15 |
| Change: new behaviour (6) | 6 | 6 |
| Change: regression (15) | 15 | 15 |

**Cost (weighted tokens):**

| | Run 1 | Run 2 | Mean | vs Nuxt | Trial 0014 |
|---|---|---|---|---|---|
| Build | 122.4 k | 95.8 k | **109.1 k** | **1.46×** | 134.7 k (1.80×) |
| Build calls | 17 | 15 | | | 21 / 15 |
| Change | 177.3 k | 111.2 k | **144.2 k** | **2.36×** | 110.6 k (1.81×) |
| Change calls | 21 | 13 | | | 13 / 11 |
| Build + change | 299.7 k | 207.0 k | 253.3 k | 1.87× | 245.3 k (1.81×) |

**Build anatomy (`bench/trial/anatomy.mjs`, means, trial 0014 → 0015):**

| | Total | Calls | Output × 5 | Docs, with carry | Docs calls | Edit calls |
|---|---|---|---|---|---|---|
| 0014 | 134.7 k | 17.0 | 36.5 k | 29.9 k | 5.5 | 4.5 |
| 0015 | 109.1 k | 14.0 | 29.5 k | 22.2 k | 3.0 | 2.5 |

## Where the tokens went
- **Build:**
  - both runs loaded the 4.6 k skill, ran `hozu docs auth` (and `contracts` or `forms`), then scaffolded;
  - they then read every generated file (13–16 k), edited, verified with `hozu post`, and finished with one server
    and `curl` check;
  - docs lookups fell from 5.5 calls to 3, and writing fell by a fifth.
- **Change, run 1 (177 k, 21 calls):**
  - a scripted edit failed halfway (an assertion in its own Python), and repairing it took several calls;
  - `hozu post` then cost four more calls:
    - `--next 'POST / id=n2&@Pin'` failed with `Field "" must be name=value`. This is a bug: run 2 of the build hit
      it too;
    - `--select 'input,label'` is unsupported;
    - `post /` while signed out said only "has no form that posts".
- **Both change runs** read the bookmarks example (about 12 k), because `topics/patterns.md` points to it for the
  patterns it marks *(example)*.

## Reading the result
- **Correctness held:** 72/72 checks again, as in trials 0012–0014.
- **The build fell by 19 %, in the components R1–R3 target:**
  - fewer guide lookups and less carried documentation;
  - fewer edit calls, and a fifth less output.
  - The ADR 0038 goal of ≤ 1.3× is not met, but 1.46× is the lowest build ratio on this task (trial 0012: 2.79×,
    trial 0013: 1.66×, trial 0014: 1.80×).
- **The change did not fall.**
  - Run 2 (111 k) matches trial 0014.
  - Run 1 is a 177 k outlier, caused by its own failed edit and by CLI friction that the guide sent it into.
  - With two runs, the change result is noise around 1.8–2.4×, not a measured regression or improvement.
- **Build + change together are equal to trial 0014 (253 k against 245 k).** 0.5 has not yet shown a net saving over
  the whole task.

## What this trial found to fix
1. **`hozu post --next 'POST / a=1&@Button'`** must accept a button after `&`.
2. **`--select`** should accept a comma-separated list.
3. **`post` to a page that redirected to sign-in** should say so.
4. **`topics/patterns.md`** should carry each pattern's snippet itself instead of pointing to the example files.
