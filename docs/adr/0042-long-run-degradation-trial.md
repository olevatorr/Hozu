# ADR 0042 — Trial 0020: long-run degradation under repeated agent changes

- Status: accepted (the owner added a Nuxt reference app, C, and left the rest as proposed)
- Motivation: trials 0012–0019 measure one build plus one change. The claim "AI-generated codebases degrade more
  slowly under Hozu" is about many changes to the same codebase, and nothing has measured it.

## Question
When one agent session per change keeps changing the same notes app, twenty times, with no memory and no reset, do
the Hozu app's correctness, cost per change, size, duplication and shipped JS degrade more slowly than the Nuxt app's?

## A. The change sequence
- **Options:**
  1. Twenty independent features, each on top of the build.
  2. **A cumulative sequence of rising reach**, where later changes touch what earlier ones added (a rename that later
     checks depend on, a route move, a feature removed).
- **Decision: 2.** Degradation only shows when changes interact. Each file is behaviour and DOM contracts (texts,
  roles, labels) in the style of `bench/trial/notes/change.md`, expressible in both frameworks without new
  dependencies, and each states "everything it does today must keep working, with and without JavaScript".

| # | Change | Reach | What the checks see |
|---|---|---|---|
| 01 | Pin + search (the existing `change.md`) | one feature | as trial 0012 |
| 02 | Max length 100 → 60, server message `Use at most 60 characters` | validation | `maxlength`, alert |
| 03 | Audit timestamp: each note shows `Added YYYY-MM-DD` in a `<time datetime>` | data field | text, attribute |
| 04 | Rename the note's text to its **title**: label `New note` → `Title`, duplicate message renamed | end to end | every later check uses the new words; the store key is observed in 19 |
| 05 | Edit in place: `Edit` → input `Edit title`, `Save` / `Cancel`, same validation and duplicate rule | per-item mode | roles, alert |
| 06 | Tags: input `Tags` (comma list), `#tag` links, filter in the URL `?tag=`, `Tagged <t>` + `All notes` | new relation | URL, list |
| 07 | Archive: `Archive` per note, `/archive` page, archived notes read-only (`Restore` only), count excludes them | new page + rule | buttons absent |
| 08 | Search in the URL: `?q=` server-filtered, `Search` submit button without JS, live filter with JS kept | URL state | no-JS form |
| 09 | Move the list to `/notes`; `/` redirects there; sign-in lands there | route move | every later path |
| 10 | Undo for delete: `role="status"` `Deleted "<title>"` with `Undo`, restoring pin, tags and timestamp | server state | status, restore |
| 11 | Load more: 5 notes per page, `Load more`, `Showing <n> of <total>`, pinned first across pages | pagination | counts |
| 12 | Optimistic add: with JS the note appears at once marked `saving…`, removed again if the server rejects it | client state | request delayed by the check |
| 13 | Bulk actions: checkbox `Select <title>`, `Delete selected`, `Archive selected`, `Selected: <n>` | multi-item | also without JS |
| 14 | Rate limit: at most 10 added notes per user per minute, alert `Too many notes, try again in a minute` | server rule | 11th add |
| 15 | Sharing: `Share with` + `Share`; the recipient sees it under `<h2>Shared with me</h2>` as `from <owner>`, read-only; `Unshare` | data ownership | HTML isolation |
| 16 | Admin page: user `admin` sees a link `Admin` and `/admin` (users and note counts); others get 403 `Not allowed` | authorization | status codes |
| 17 | Delete account: `/account/delete`, `Delete my account and notes`, then `/login` with `Account deleted`; their shares vanish | cross-cutting delete | other users' pages |
| 18 | Second language: a `Deutsch` / `English` control on both pages, a given string table, persists across reloads | every string | German subset; regressions stay English |
| 19 | Export: `GET /api/export` → JSON `{ user, notes: [{ title, pinned, archived, tags, createdAt }] }`, 401 signed out | endpoint | keys (catches an incomplete 04) |
| 20 | Remove tags entirely (input, links, filter, export key) | removal | tag checks retired, absence checked |

- **Dropped from the suggested list: sort options.** It would be the 21st, and 11 + 12 already cover list ordering.
- **Mechanism is left open where frameworks differ** (18: URL prefix or cookie; 12: how the pending item is held).
  Only the observable behaviour is fixed. A language cookie must be `HttpOnly` like every cookie (N4 still applies).

## B. Cumulative hidden acceptance
- **Options:**
  1. Extend `bench/trial/notes/accept.mjs` with phases 3–21.
  2. **A new `bench/trial/longrun/accept.mjs` with a check registry** that imports nothing from the old file but copies
     its helpers.
- **Decision: 2.** The old script stays the frozen acceptance of trials 0012–0019.
- **Registry:** each check is `{ id, since, until?, what, spec, run }`.
  - `since` is the step that introduced it (0 = build), `until` the step that retired it (20 retires the tag checks).
  - `spec` quotes the sentence of the change file it tests, so a check can be compared with the wording (the trial 0017
    lesson).
  - After step k the script runs every check with `since ≤ k < until`, and labels it `new` (`since = k`) or
    `regression`.
- **Vocabulary per step:** words that a change deliberately alters (the `Title` label, the `/notes` path, the length
  limit, the duplicate text) come from `vocab(k)`, so the build checks keep testing the same behaviour in the words of
  step k.
- **Isolation:** one server per run (fresh seed); each check signs in its own fresh user, except the seed checks for
  `ada` / `bob`. So the order of checks and the rate limit cannot couple them.
- **Robust locators:** the main list is the `<li>`s that contain the note's own buttons; lists that later changes add
  are located through the heading the change file names. Nothing depends on markup the files do not fix.
- **Client JS:** during the run, the bytes of every script response on `/login` and the list page (fresh context, JS
  on) are summed.
- **Output:** `{ step, passed, total, new: { passed, total }, regression: { passed, total }, failures: [...], js }`.

## C. Validating the acceptance before any run
- **Decision:** a Hozu reference app, `bench/trial/longrun/reference/`, starts as a copy of `examples/notes` (which
  already has step 01), and implements steps 02–20 as 20 commits exported to `reference/steps/NN.patch`.
  `verify-reference.sh` applies them in order and runs the acceptance after each; its log is checked in. Every step
  must pass 100 %.
- **Open risk:** a Hozu reference cannot prove a check is fair to Nuxt. Mitigations: every check quotes its sentence;
  when all apps fail one check identically, the check is suspected first.
- **Decision (owner): a Nuxt reference too,** `reference/nuxt/`, built from the `nuxt-0006` scaffold to the build spec
  and then through steps 01–20 the same way. A check counts as validated only when both references pass it.

## D. The runner
- `bench/trial/longrun/run.sh <hozu|nuxt> <run-id> <port>`:
  - step 0 creates the app exactly as trials 0016–0019 (packed tarballs + `create-hozu --agent claude`; `nuxt-0006`
    via `git archive`), `git init`, and runs the build prompt;
  - steps 1–20 copy only `changes/NN.md` into the app as `change.md`, run one `claude -p` session, commit, run the
    acceptance, and append a line to `results/<fw>/<run>/metrics.jsonl`.
- **Prompts:** the trial 0016 wording was not kept in the repository. It is reconstructed from its description (read
  the spec or change file in this directory only; this port is yours for trying the app) and checked in as
  `prompts/build.md` and `prompts/change.md`, identical for both frameworks apart from the port.
- **Void steps:** a result text containing "hit your session limit" (or a rate-limit error result) is VOID: the runner
  resets to the pre-step commit (`git reset --hard`, `git clean -fd`, keeping ignored `node_modules`), waits 30
  minutes, and re-runs. A 1800 s timeout is a real failure, not void.
- **Never repaired:** a failed step is committed as is and the next change runs on top of it.
- **Parallelism:** Hozu and Nuxt in parallel on different ports; steps within one app strictly sequential.

## E. Metrics per step
| Metric | How |
|---|---|
| New / regression passed | acceptance JSON |
| Silent failure | the final result text claims success (no "could not", "failing", "not implemented", "partially", …) **and** a check fails; the final text is stored for review |
| Weighted tokens, calls, output, docs / read / edit / verify | `bench/trial/anatomy.mjs` |
| App lines | tracked files minus lockfiles, `.nuxt`, `.output`, `dist`; `hozu.lock.json` counted separately |
| Lines added / removed | `git diff --numstat` of the step commit, same exclusions |
| Duplication | `dup.mjs`: normalized lines (trimmed, blank and lone-brace lines dropped), 5-line windows hashed; duplicated lines = lines in a window seen more than once |
| Client JS | acceptance (B) |
| Type-check / build | Hozu `npx hozu check --json` (errors, warnings, contract coverage); Nuxt `pnpm typecheck`, `pnpm build` |
| Hozu only | lock entry count and entries changed; states and transitions (`hozu inspect --json`); unreachable states (the validator's rule); HZ018 seen and `--update-lock` runs in the transcript |

- `pnpm build` runs before the acceptance for Nuxt (its entry is `.output`), and is part of the measure, not a repair.

## F. How the result is read
- **Slopes, not totals:** per step, cost against app lines, regressions over time, duplication and JS growth, and
  silent failures, as tables plus an SVG chart of the four curves.
- **Stated before the runs:** the thesis holds if, over steps 1–20, Hozu has fewer regression failures and a lower slope
  of cost per step against app size than Nuxt. The other metrics are reported, not scored.
- **Noise:** trial 0016 saw ±15 % per step on one change. Two runs per framework are planned; the second pair runs if
  the quota allows after the first, and the report says how many runs it has.

## Cost
- About 2 frameworks × 21 steps × 60–150 k weighted tokens ≈ 2.5–6.3 M per run pair, plus the reference work. Runs are
  spaced out; `pnpm gate` is not part of this task except once at the end if the reference touches the workspace.

## Out of scope
- No framework changes. Hozu defects found along the way are reported, not fixed, unless the owner approves.
- No CI, no push, no tag, no publish. Commits go to the local branch `trial-0020`.

## Result
- **Run as decided,** with two runs per framework and both reference apps passing every step
  (`bench/trial/longrun/reference/`). Details and data are in `docs/trials/0020-long-run.md`.
- **Settled along the way:**
  - A1 / SH1 no longer count hidden inputs (found by the Hozu reference before any run);
  - the acceptance relaunches Chrome and re-runs a check when the browser crashes (seen once under load while
    verifying the references; zero crashes in the trial runs);
  - the silent-failure heuristic also reads Chinese summaries, and the failing steps were classified by hand.
- **The criterion in F is not met:** Nuxt had no regression in either run, and Hozu's cost per change doubled from
  steps 1–10 to 11–20 (Nuxt +15–27 %). Hozu kept duplication at 1–2.5 % (Nuxt 6.5–8.2 %) and client JS at
  24–26 KB (Nuxt 232 KB).
- **Hozu defects found:** D1–D8 in the reference app and D9 in the trial apps (live refetch racing a session change).
  Framework code was not changed.
