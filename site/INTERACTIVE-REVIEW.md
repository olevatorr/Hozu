# Interactive How it works review

The user approved JavaScript on the overview after reviewing the initial static version. `/how-it-works` is now an interactive workbench. Six long-form chapters remain static, retain their existing word counts and continue to supply the detailed source references.

## Experience

- Run a preset toggle feature through Source → Feature IR → Validator → Compiler → Runtime. A Hozu machine owns the sequence and its timers.
- Remove a contract and replay the example. The illustration stops at validation with an HZ016 explanation. Restore it and run successfully again.
- Change scope, freshness and machine binding to compare 16 combinations. A page diagram shows the static shell, query region and possible island independently.
- The page explicitly identifies its walkthrough as a preset illustration. It does not claim to compile code or fetch user/live data in the browser. Its timer durations are presentation pacing, not performance measurements.

The design uses a source pane beside an execution trace, a larger introductory heading and joint illustration, a separate rendering workbench and a compact chapter directory. The header stays compact. On mobile the execution controls and result precede the code, so trying the example does not require scrolling through its source first.

Screenshot review also caught a keyboard issue: removing the Run button during execution lost focus. The button now stays mounted, and the browser test confirms focus remains through completion. Runs in progress ignore repeated run/contract events and show a status message. Changing render settings re-enters the current pipeline stage, restarting only that stage's illustrative timer.

## Implementation

- `features/lab/model.ts`: typed events, machine, timer transitions and contracts.
- `features/lab/views.ts`: machine-bound overview, pipeline, render-plan controls and chapter navigation.
- `features/content/articles.ts`, `views.ts`: remove the former static overview and export the chapter-list query through the feature boundary.
- `hozu.config.ts`: register the new feature and mount its view only on the overview route.
- `hozu.lock.json`: accept the intended machine behaviour.
- `app.css`: scoped workbench layout, responsive ordering, active stages, themes and reduced-motion rules.
- `verify.ts`: allow scripts only on the explicit overview; retain all static page, link and asset checks.
- `verify-browser.ts`: repeatable browser interaction, layout, keyboard and script-isolation checks using the repository's existing Playwright tooling.
- `README.md`, `REVIEW.md`, `FRAMEWORK-GAPS.md` and ADR 0034: updated decisions and evidence.

No package source, dependencies, Pages workflow or deployment configuration changed.

## Verification

Node 22.22.2 was used. `pnpm gate` passed once for this phase: lint and typecheck clean, 264 tests passed (4 skipped), all benchmark budgets passed. The static server on port 4799 was stopped by PID 12616 after inspection. No development server ran.

- `pnpm --filter hozu-site check`: types OK, 0 errors, 0 warnings, 42/42 transition coverage, lock checked.
- `hozu get /how-it-works --json`: 200, new page content present. The site verification also checks all chapters, home, docs, trial, changelog and missing pages with expected text/status.
- Export: 48 framework-exported files, 0 skipped routes, plus CNAME and `.nojekyll`.
- Site verification: 34 HTML files, 32 canonical sitemap URLs; all local links, fragments and assets resolve.
- Browser verification: valid run, missing contract, repaired run, keyboard focus, all 16 rendering combinations, reduced motion, six responsive layouts, static chapter links without JS and no page errors. No effect endpoint is requested.
- `hozu plan how`: cacheable static HTML with 28 machine-bound island nodes, `js: true`. `hozu plan home`: no islands, `js: false`.

Chromium's observed script responses for the overview:

| Script | Uncompressed bytes | Locally gzip-compressed bytes |
| --- | ---: | ---: |
| `client.js` | 18,656 | 7,772 |
| `navigate.js` | 3,607 | 1,874 |
| Total | 22,263 | 9,646 |

The gzip column is calculated from the response bodies, not a claim about the local static server's wire compression. The HTML also contains a 28,060-byte serialized page payload; this is separate from the script sizes. Export writes additional runtime chunks, but the tested interactions request only the two scripts listed above.

Home, docs, How it works chapters, trials and changelog have no client script tags or module preloads. Independent browser visits to representative pages made zero script requests.

## Screenshots reviewed

All evidence is saved locally under `.tmp/site-interactive/` and is ignored by Git:

- `overview-375-light.png`, `overview-375-dark.png`
- `overview-768-light.png`, `overview-768-dark.png`
- `overview-1280-light.png`, `overview-1280-dark.png`
- `blocked-1280-light.png`: missing contract and validation stop
- `plan-1280-dark.png`: successful run, user-scoped data and a bound island

All three viewport widths have no horizontal page overflow. Code panes scroll internally. Reduced-motion mode disables decorative transitions. `browser-results.json` records the measured requests and assertions.

## Framework feedback

One new gap: the authoring surface has no `ui.noscript`. The attempt produced TS2339 and HZ014. The supported fallback is a brief always-visible JavaScript requirement plus the static chapter links. Exact diagnostics are in `FRAMEWORK-GAPS.md`.

The earlier conditional clipboard preload limitation is unchanged. It does not block this explicitly interactive route, and the copy button remains out of scope for this approved phase.
