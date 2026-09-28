# Trial 0018 — the widget task on 0.6 (`hozu browse`, HZ047)

**Question:** trial 0017 found that on a widget-heavy app, Hozu runs spent part of their extra cost verifying code that
only runs in the browser. Does 0.6 (ADR 0040) lower that cost? It adds:
- `hozu browse`;
- HZ047;
- no favicon request;
- the `add widget` fix.

## Setup
- **Identical to trial 0017:** the spec, change request, prompts, model (`claude-opus-5-5`) and the corrected hidden
  acceptance.
- **Hozu:** two Claude runs on the packed 0.6.0, whose generated `CLAUDE.md` lists `hozu browse` in the loop.
- **Nuxt:** trial 0017's two runs, not re-run.

## Results
**Correctness: every run passes everything:** build 15/15, change 8/8 new and 15/15 regression, in both runs.

**Cost (weighted tokens):**

| | h1 | h2 | Mean | Trial 0017 (0.5.1) | Nuxt | vs Nuxt |
|---|---|---|---|---|---|---|
| Build | 288.5 k | 271.4 k | **279.9 k** | 345.4 k | 130.3 k | **2.15×** (was 2.65×) |
| Change | 231.6 k | 158.4 k | **195.0 k** | 196.2 k | 56.3 k | **3.46×** (was 3.48×) |
| Calls, build / change | 25 / 24 | 22 / 16 | | 30 / 19 | 12 / 7.5 | |

## Reading the result
**Build fell 19 %, because browser verification is now one command.**
- Both runs used `hozu browse` 3–5 times per step:
  - fill a search;
  - click a station;
  - read the widget list and the errors;
  - one run also used `--screenshot`.
- No run wrote its own headless-Chrome or CDP script. In trial 0017 both builds did.
- No favicon detour. No HZ047 was hit: neither run put a helper outside `impl`.

**Change did not move.**
- h1's change spent about 5 calls on a detour unrelated to Hozu: it reformatted its client files with Prettier and
  reverted them.
- Both changes read the lock file and several topics.
- h2's change (158 k) is the cheapest Hozu change on this task so far.
- With two runs the spread (±19 %) is as large as the effect.

**What is left is structural:**
- **Output:** about 20 k output tokens per build, which is 98–100 k weighted and 35 % of the cost. Nuxt writes about
  13–14 k. A widget is still a declaration, a client module and a `ui.use`, plus the machine and contracts.
- **Docs carried:** 74–79 k per build. The agents read the widgets, patterns, views, machine, data, pages, forms and
  contracts topics before writing.
- **Starting the server:** every run still ends with `npm start`, as the prompt allows. `browse` replaced the browser
  script, not this final habit.

## Conclusion
- **0.6 cut the build on the widget task from 2.65× to 2.15× Nuxt,** with every check passing. `hozu browse` was
  adopted without being asked for, and replaced the hand-written browser scripts.
- **The change step is unchanged at about 3.5×.** Its cost is reading and writing, not verification.
- **The remaining gap is code volume and the guide.** These are the next targets if the task class matters. Both are
  questions of design (fewer pieces per widget; less to read per change) rather than defects.
