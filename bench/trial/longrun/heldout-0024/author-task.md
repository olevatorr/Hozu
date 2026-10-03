# Task: write eight held-out change requests (21–28) for the notes app, with hidden acceptance checks

You work only inside this directory. Do not read any file outside it (the `parity/node_modules` link is a
browser-automation library the harness needs; do not read it either). Write everything in English.

## What is here
- `spec.md`: the notes app as first built (step 0).
- `changes/01.md` … `changes/20.md`: the change requests applied to it in order. The app after step 20 is the
  starting point of your changes.
- `app/`: a reference implementation of the app after step 20, in Nuxt. It is a git repository with the tag `s20`.
- `harness/longrun/accept.mjs`: the hidden acceptance test. `node harness/longrun/accept.mjs nuxt <appDir>
  .output/server/index.mjs <port> <step>` builds nothing; it starts the built app on `<port>`, runs every check whose
  step range includes `<step>` (new and regression), and prints JSON with `passed` / `total` and the failures.
  `harness/longrun/summary.mjs` reads that JSON from stdin and prints one line.
- `harness/longrun/heldout.mjs` and `harness/longrun/test-fixtures/example-heldout.mjs`: how extra checks are
  added. With `HOZU_HELDOUT=<file>` the harness imports that module; its default export receives the helpers
  (`check`, `base`, `V`, `vocab`, `assert`, `newPage`, `fresh`, `add`, `has`, `items`, … — read `accept.mjs` around
  `loadHeldout` for the full list) and registers checks with ids starting with `X`. `export const retires = { ID: step }`
  ends an earlier check at a step when a change makes it obsolete.

## What to deliver
1. **`out/changes/21.md` … `out/changes/28.md`:** eight change requests in exactly the style of `changes/19.md` and
   `changes/20.md` (the same opening paragraph, product language, concrete and testable). Each builds on the app as
   it is after the previous one.
   - Make them realistic for a product that is in use, and varied. Across the eight, cover:
     - a new page;
     - a change to data that already exists (a migration in effect);
     - a rule about who may see or change what;
     - a form with validation that must also work without JavaScript;
     - a change to an existing behaviour that earlier checks rely on (retire those checks explicitly);
     - something that must update without a reload;
     - an API or export change;
     - a removal.
   - Each request must be implementable in one working session by a capable developer.
   - Write them for any web framework: never name a framework, library or file in the app.
2. **`out/accept-heldout.mjs`:** the checks for 21–28 (ids `X21a`, `X21b`, …, each `since` its step), using only the
   helpers the harness passes. Check observable behaviour through HTTP and the browser, with and without
   JavaScript where the request says so. Use `retires` for every earlier check a change invalidates. Every new
   behaviour stated in a request has at least one check.
3. **The reference implementation:** implement each change in `app/` in order. After each one, build it
   (`pnpm build`), run the harness for that step with `HOZU_HELDOUT=$PWD/out/accept-heldout.mjs`, and commit with the
   tag `s21` … `s28`. Every step must pass 100 % of its checks, new and regression. Use ports 4950–4959.
   - If a check is wrong, fix the check. If a request is ambiguous, fix the request. Do this before you move on;
     after step 28 passes, run all eight steps again from `s20` with the final files, and all must still pass
     (checkout each tag, build, run). Record that final run in `out/validation.txt` (the summary line per step).
4. **`out/summary.md`:** one line per change (what it asks, in under 15 words), and nothing else about them.

Stop any server you start, by its PID, before you finish. End with a short report: the eight one-line summaries,
the final validation lines, and anything you could not do.
