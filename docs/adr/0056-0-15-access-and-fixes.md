# ADR 0056 — 0.15: declared access, test tools for it, and the fixes the 0.14 dogfood found

- **Status:**
  - **Scope accepted** (owner, 2026-10-04): declared access as an error, a row check that reports, and all 13
    dogfood findings plus `bench:frameworks`.
  - **Decided and implemented** (owner, 2026-10-04: "do the rest to the end, AI-first"): Phases A, B and C, with
    the changes recorded below. C5 (generated access checks) is deferred.
- **Sources:**
  - ADR 0054 (the access draft, now decided: option A);
  - the 0.14 dogfood (`hozu-dogfood-0.14/*/FRICTION.md`, each finding reproduced in `hozu-dogfood-0.14/repro`);
  - trial 0024 (an incomplete new feature passed `hozu check` with Sonnet 5).

## Phase A — fixes (decided)
| # | Finding | Decision |
|---|---|---|
| A1 | An `href` built with `ui.link` from machine context keeps its server value after the context changes | Bug: the client re-evaluates link attributes like any other bound attribute. A browser test asserts `/?currency=USD` after the event |
| A2 | An endpoint `fail('E', { message, extra })` drops `extra` | Bug: the response is `{ error, ...data }`, with every field the error schema declares. The `fail` data is checked against the schema in development |
| A3 | An optional env variable set to the empty string fails to parse | Bug: the env parser treats `''` as unset (server and public), so `optional` and `default` apply and the `X=` lines of `hozu env --example` work as written |
| A4 | `views --more` says a query branch may return a list; HZ014 requires one element | Docs: a list is valid only as a `?:` / `&&` branch. Query branches and each items return one node. The topic is fixed, and a docs test checks the sentence against the rule |
| A5 | A disallowed endpoint status gives HZ014 and HZ046, and points at `views` | One diagnostic: HZ046 says which statuses an endpoint error may answer, and points at `endpoints` |
| A6 | `hozu plan /journal` wants a route name | `plan` accepts a path and resolves it to its route; an unknown path suggests the routes |
| A7 | `hozu check --update-lock` prints only "lock updated" | It prints the accepted `now:` lines (all of them; `--json` carries them as `accepted`) |
| A8 | `hozu <command> --help` prints the global help | Each command prints its own usage lines and options |
| A9 | `head.input`'s second argument (the locale) is undocumented, and `locale` is a `string` | Documented in `pages` and `i18n`: the locale reaches data through the query input, and `as Locale` narrows it. It stays `string`: views and pages are declared before the project, so the union of `site.locales` could reach them only through a global type registry (principle 2) |
| A10 | `@hozu/content` is not installed by the scaffold, and `loadCollection` has one line of docs | The content topic says to install it, and documents slugs (file names), sub-folders, order, YAML dates and fields |
| A11 | The scaffold stores English text in `ctx.error` (against "machines hold codes") | The scaffold stores a code (`'duplicate'`) and the view picks the text |
| A12 | `hozu serve` (`npm start`) leaves `NODE_ENV` unset, so a session app starts without `SESSION_SECRET` | `hozu serve` runs as production unless `NODE_ENV` is set: a session app without `SESSION_SECRET` refuses to start with the fix. `hozu dev`, `get`, `browse`, `call` and `testApp` are unchanged |
| A13 | `og:locale` is `en` for `site.lang: 'en'`; the sitemap has no alternates | `og:locale` uses the likely region from `Intl.Locale.maximize()` (`en` → `en_US`, `de` → `de_DE`, `zh-TW` → `zh_TW`). The sitemap lists each URL's `xhtml:link` alternates when `site.locales` is set. `lastmod` is not added: no declared date is reliable for every entry |
| A14 | `bench:frameworks`: the Hozu row no longer reacts to clicks | **Cause:** since 0.8 the bench app writes `ctx.count += 1`, but `run.ts` ran without `@hozu/transform`, so nothing was lowered. Since 0.12, the operator builtins also live in the fn modules the bench never served. **Fix:** the run registers the transform; the page gets its fn modules (served and modulepreloaded, counted in its JS); a build error stops the run. **Gate:** `pnpm bench` B2 runs the Hozu row once (`BENCH_ONLY=hozu BENCH_RUNS=1`) when `CHROMIUM_PATH` is set, and fails if it does not count the clicks. **Found:** interactive at 59–61 ms (4× CPU) against 27.8 ms in benchmark 0001's sixth run, with JS 7.9 KB gzip (7.5 KB then). It went unmeasured while the bench was broken. **Cause, measured:** of the 40 ms of hydration, 33 ms was waiting for `import()` of the fn module. The module itself is 98 B and was already downloaded; the time was the extra task hops under 4× CPU. That cost came with 0.12's per-feature fn modules (ADR 0050 C). **Fix:** each fn module is a `<script type="module">` placed before the client and registers itself by its URL, so hydration reads it without `import()` (and falls back to `import()` when a module is missing). Hydrate 41 → 6 ms; interactive 62 → 26.5 ms (27.8 ms in benchmark 0001). B2 now has a budget of 50 ms |
| A15 | `browse --js both` reports DIFFERS when two modes create different random ids | The parity compare ignores route parameters in the location; text and status are still compared |
| A16 | Server resolvers do not see public env; `env.internal` applies only to `'either'` effects | Docs: the env topic says so, and shows reading both URLs in a server resolver |

## Phase B — declared access (decided)
- **The rule:**
  - Every `scope: 'user'` query and every mutation declares `access`.
  - A missing `access` is a type error, and HZ088 in untyped code.
  - `access` on a `scope: 'public'` query is HZ089 (warning).
- **The forms:** one canonical form per meaning. The callbacks are lowered like guards, so the IR holds paths, not
  functions. **As built**, `access` is a literal or an object, like `runs`, not four functions: `@hozu/core` keeps
  its export budget, and an agent writes the forms without an import.
  - **`'anyone'`:** no condition. On a `scope: 'user'` query it is HZ090 (a warning, which can be accepted with a
    reason).
  - **`'signedIn'`:** the session is not `null`.
  - **`{ allow: ({ session, input }) => session.role === 'admin' }`:** a guard over the session and the input.
  - **`{ owner: { row: (n) => n.owner, session: (s) => s.user } }`, on a query:** every row of the output (or the
    output itself, when it is an object) has `row(…) === session(…)`.
  - **`{ owner: { load: getNote, input: (i) => ({ id: i.id }), row: (n) => n.owner, session: (s) => s.user } }`,
    on a mutation:** the framework loads the row with that query first, and the check is made on it.
- **At run time:**
  - **Refused:** a failed `signedIn` / `allow` / mutation `owner` answers the framework error `Forbidden`, which is
    optional in `failed`, like `Invalid`. The resolver does not run.
  - **Query `owner` (the owner's decision):** rows that do not match are removed. In development, and in
    `hozu check`'s runtime pass, that is an error (HZ091) naming the resolver, because it means the query read
    too much. In production it is logged once per query and the rows are dropped.
- **Testing:**
  - `hozu why <effect>` and `hozu map` show each effect's access.
  - The lock records access, so a change to it is a reviewed change, like a transition.
  - `testApp` and `hozu call --session` exercise it.
  - Phase C adds the cross-user check.
- **Migration (0.14 → 0.15):**
  - `access: 'anyone'` on every effect that needs one. The IR keeps the old behaviour, so the app runs as before.
  - The new warnings (HZ090) then list every user query to tighten, or to accept with a reason.
  - Nothing is tightened silently.
- **Why `owner` needs the row to carry its owner:**
  - Today's apps (`examples/notes`) filter by `session.user` in the resolver and do not return the owner.
  - The framework can check only what it sees, so `owner` asks the output to include the owner field.
  - Where that is unwanted, `'signedIn'` plus resolver scoping is the honest declaration.
- **Scope, as built:** access applies where the server enforces it: `runs: 'server'` user queries and mutations.
  A browser-run effect is guarded by the API it calls, so `access` there is HZ089.

## Phase C — test tools for access and the dogfood's gaps (decided)
- **`hozu call <endpoint>`:** endpoints with `--header 'Authorization: Bearer …'` and `--body`. Today it refuses
  endpoints.
- **`hozu browse --header`:** a header on every request of an actor.
- **Steps that remember:** `remember <name> from <selector|url>` and `$name` in later steps. One actor can then use
  another's URL or id, so "B cannot open A's note" is one chain.
- **`hozu browse --do 'post <path> field=value'`:** a forged form post as the current actor, without the page.
  The answer status and text are reported.
- **Generated access checks: deferred.** For every `owner` rule, `hozu check` would run "user B reads / writes user
  A's row → `Forbidden` or not listed", with the app's resolvers in memory and two sessions. Building it showed
  what it needs that the framework does not have: an input naming a row that exists, and two sessions that the
  app's own sign-in would issue. Inventing either would make a check that passes on data the app never holds.
  Instead, the runtime checks every request (`Forbidden`, HZ091 in development), and the cross-user chain is one
  `browse` command with `remember` and `$name` (the auth and testing topics show it).

## Not in 0.15
- Option C of ADR 0054 (a declared data layer with derived invalidation).
- Session-aware tags.
- More than one machine per feature.
- A scaffold that is not a to-do list.
- Checks at the level of the requirement (the Sonnet 5 finding).

These are noted for later ADRs.

## Release
- Phase A ships first on this branch, with the gate green. B and C follow after the owner confirms them.
- 0.15.0 is released when all three are done.
- **The guide:** every phase updates the skill topics within the short-form budget (ADR 0053 E).
