# Trial 0012 — Correctness where agents often go wrong (the notes app)

**Question:** trials 0003–0011 measured cost on a task both frameworks always got right. Does Hozu buy correctness
on a task designed around common agent mistakes, and at what cost?

## The task
`bench/trial/notes/spec.md` and `change.md` describe a personal notes app with accounts. Every requirement is
stated explicitly, and the wording is framework-neutral. The hidden acceptance (`bench/trial/notes/accept.mjs`)
targets the places agents often get wrong:
- **Isolation:** two users signed in at once each see only their own notes, in the browser and in the HTML the
  server sends.
- **Double submit:** clicking `Add` twice quickly adds one note and shows no error.
- **Without JavaScript:** signing in and out, adding (with the duplicate alert) and deleting.
- **Sessions:** the cookie is `HttpOnly`, and `/` redirects to `/login` when signed out.
- **Change request (pinning, in-browser search):** new behaviour (phase 2), plus the whole of phase 1 again as a
  regression check.

**The acceptance was validated before the trial:**
- a Hozu reference app (`examples/notes`) passes 15/15 and 6/6;
- a deliberately broken copy, with one notes list shared by all users, fails the three isolation checks.

## Setup
- **As in trials 0009–0011:** `claude -p` in the app directory, `claude-opus-5-5`, prompts of the same shape, two
  runs per arm and step.
- **Hozu:** the packed 0.3.0 app from `create-hozu --agent claude`.
- **Nuxt:** the trial 0006 blank scaffold.
- **A voided first attempt:** the first four build runs stopped after 3–5 turns with "You've hit your session limit"
  (the runs use the user's plan), so nothing was built. They were discarded, and the directories reset to the
  scaffold commit. All four were then re-run after the limit reset.

## Results
**Correctness:**

| | Hozu run 1 | Hozu run 2 | Nuxt run 1 | Nuxt run 2 |
|---|---|---|---|---|
| Build (15 checks) | 15 | 15 | 15 | 15 |
| Change: new behaviour (6) | 6 | 6 | **4** | 6 |
| Change: regression (15) | 15 | 15 | **12** | 15 |
| **All 36 checks** | **36** | **36** | **31** | **36** |

**Nuxt run 1's failures** reproduce on a re-run:
- **P1, P3:** a pinned note is marked `pinned` but not moved first, and unpinning leaves the order wrong.
- **N7, N10, N11 (regressions):** after the change, a note added with JS does not appear, a double-clicked note does
  not appear at all, and a deleted note stays listed. All three passed before the change.

The cause is in `bench/trial/notes/nuxt-0012-run1.change.diff`. The pin handler mutates `note.pinned` in place on
`useFetch` data, which Nuxt 4 keeps in a shallow ref, so the sorted list and later refreshes stop updating.
`pnpm typecheck` and `pnpm build` both passed, and the agent reported success.

**Cost (weighted tokens):**

| | Hozu run 1 | Hozu run 2 | Nuxt run 1 | Nuxt run 2 | Mean ratio |
|---|---|---|---|---|---|
| Build | 198.5 k | 219.8 k | 81.9 k | 67.8 k | **2.79×** |
| Change | 158.7 k | 92.7 k | 70.5 k | 51.6 k | **2.06×** |
| Cost (USD, build + change) | 1.51 | 1.38 | 0.70 | 0.59 | 2.24× |

## Reading the result
- **In the build, the model got every trap right in both frameworks.** Isolation, double submit, no-JS forms and
  HttpOnly cookies are well within what this model writes correctly in Nuxt. This task did not separate the
  frameworks at build time.
- **In the change, one of two Nuxt runs broke existing behaviour and shipped it.** This is the failure Hozu's
  design targets:
  - behaviour lives in a machine checked by contracts;
  - data refresh is framework-owned (tags and invalidation), not hand-written state updates;
  - `hozu check` would have failed on a broken transition.

  Both Hozu change runs passed everything.
- **The evidence is small:** one failure in two runs. It shows the kind of error, not its rate.
- **The price is about 2–3× the tokens.** Hozu's build cost here (2.79×) is higher than on the task board, because
  the scaffold does not cover accounts: the agents built sessions and user-scoped data from `reference.md`.

## Conclusion
- **Measured:**
  - correctness Hozu **72/72** checks against Nuxt **67/72**, the difference being one change that silently broke
    three working features;
  - cost **2.79×** to build and **2.06×** to change.
- **Two directions:**
  - Measuring more changes (repeated edits to one app) would tell how often this happens, which is what the price
    buys.
  - Covering accounts in the scaffold (`--with auth`) would lower the build cost for this common kind of app.
