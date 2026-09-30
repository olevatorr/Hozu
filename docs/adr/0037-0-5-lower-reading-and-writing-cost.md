# ADR 0037 — 0.5.0: lower the cost of reading and writing Hozu

> **Superseded in part by ADR 0043 (0.8.0):** D3 and the Result: the lock must equal the computed lock (HZ057), copy-only changes stay lock-reviewed even when a contract covers them, and a contract over only copy-only transitions is HZ058 instead of being allowed as an example (G). D5: `hozu check` imports the declared app module, so it runs app code (D, E). D6: an endpoint's `output` is a schema, `'redirect'` or `'response'`, never HTML (HZ053), with `errors`, `failed`, `invalidates` and `input: 'raw'` (D). **Erratum (D6):** the resolver context's `redirect` is used only with `output: 'redirect'` as `redirect(ui.link(route, params, search?))`; `'response'` is for bodies that are neither JSON nor HTML, not for redirects.

- Status: accepted (the user approved the plan and decided D3 and D4)
- Motivation: the trials measured the cost that remains, and it is not in the tools.
  - **Reading:** trial 0009 found that agents read 30–40 k characters before writing Hozu, against 3 k for Nuxt.
  - **Size:** trial 0011 found that the generated feature is about 15 KB, more than the whole Nuxt app (9 KB).
    Contracts and the explicit machine are a large part of it.
  - **Cost:** 0.3 builds cost 1.6–2.3× Nuxt.
  - **What did not help:** 0.3 added tools (`map`, recipes, summaries). They were used, but they did not lower the
    cost, because agents read the code they edit whatever the guide says.
- The owner's review adds three weaknesses beyond size.
  - **A silent trap:** a recorded reference used as a JavaScript value. `===` and method calls are TypeScript
    errors, but with messages about `Expr<…>` types that do not say what to do. Truthiness (`x ? a : b`, `x && y`,
    `x ?? y`, `if (x)`, `!x`) is not caught at all, and renders the wrong thing.
  - **Diagnostics that do not say what is missing:** a query without `pending` is reported as `Invalid view child`.
  - **Steps outside the IR fail silently:** `serve.ts` is not checked. Widgets were fixed in 0.4.2.
  - It also notes a missing capability: no declared HTTP endpoints, which OIDC, webhooks and app APIs need.

## D1. Catch references used as values
**Situation:** TypeScript 7 has no JavaScript compiler API, and the CLI has no third-party dependencies.
**Decision:**
- **(a) Translate the TypeScript errors.** `hozu check` recognises TS2367, TS2339, TS2365 and TS2362 when the type
  in the message is `Expr<…>`, `Ref<…>` or `Guard`. It adds a Hozu explanation and the fix to the issue: `op.eq` /
  `op.neq` for comparisons, and `fn()` for computations.
- **(b) HZ044 `reference-truthiness`, a warning.** A small token scanner in `@hozu/validator` reads the feature
  source files that the build records.
  - **What it reports:** a builder callback parameter (`ctx`, `params`, `search`, `e`, the item or data of
    `ui.each` / `ready` / `done` / `failed`), or a property path on one, used as the condition of `?:`, the left
    side of `&&` / `||` / `??`, the operand of `!`, or the condition of `if` / `while`.
  - **What it skips:** `fn({ impl })` bodies and callbacks of `.map` / `.filter` / `.forEach` on constant arrays,
    since those run real JavaScript.
  - **Diagnostic:** the location, the cause ("references are recorded; this is always truthy"), and the fix (`ui.if`
    with `op.*` in views, a guard in machines).
  - **Why a warning:** the scanner is heuristic, so it warns rather than errors. It gets a registry entry, a rule, a
    fix, and a mistake-catalog case.

## D2. Diagnostics say what is expected
- **`Invalid view child`** names what it got (`undefined`, a function, an object) and the likely cause. For
  `undefined`, that is a field left out, or a callback that returns nothing.
- **`ui.query` `pending` is optional.** Leaving it out means nothing is shown while loading, as ADR 0022 does for
  other absent values. `null` stays accepted.
- **The skill matches reality:** the code blocks of `SKILL.md` and `reference.md` that declare something are
  compiled in a test app. A test fails if a documented form stops type-checking.

## D3. Contracts only for decisions (the owner chose this)
**Mechanical transition:** a transition that
- has no guard and no `navigate`;
- calls no `fn` in its assign values or in the `invoke` input of its target state.

Its contract would only restate the machine.

**Decision:**
- **HZ016** is reported only for non-mechanical transitions: guards, navigation and computation.
- **Mechanical transitions stay reviewed through the lock.** Each lock entry gets a readable `summary`, e.g.
  `idle --Draft--> idle · draft := event.text`. A change to a mechanical transition is HZ018 until
  `hozu validate --update-lock` accepts it, and the summary diff shows what changed.
- **Contracts stay allowed** for mechanical transitions, as examples.
- **Principle 5 now reads:** every behaviour change requires a reviewed change — a contract for decisions, the lock
  for mechanical transitions.
- **Effect on the scaffold:** it writes contracts only where they are required, so tasks goes from 12 contracts
  (3.6 KB) to about 0–2.

## D4. Busy states by rule (the owner chose this)
- **A state with `invoke` drops every event it does not handle.** The builder derives its `ignore` list, so the
  runtime, HZ005 and HZ034 do not change.
  - Writing `ignore` in an invoke state is HZ014 ("invoke states drop unhandled events"), with a patch that removes
    it. It stays the one form for non-invoke states.
- **`done` and each `failed` entry** accept a target state name, one transition, or a list of guarded transitions.
  All three become the same IR.
  - This is an owner-approved exception to principle 1, because the list form is only needed with guards.
- **Effect:** the tasks machine loses the three `ignore` lists and most of the brackets.

## D5. Check what lives outside the IR
- **`hozu check` reads `serve.ts` as text** (it never runs it) and warns, with the fix, when:
  - views use widgets but it has no `bundleWidgets`;
  - the project declares `session` but `createServer` gets no `session`.
- **`hozu add widget <feature> <Name>`** writes the declaration, the client module and the `serve.ts` wiring, adds
  `@hozu/bundle` to `package.json`, and prints the install command.

## D6. Declared HTTP endpoints
- **`endpoint({ method, path, input, output })`** is a declaration.
  - `input` is a schema for the query string (GET) or JSON body (POST).
  - `output` is a schema, or `'response'` for handlers that redirect or set cookies.
- **It is implemented in `resolvers`:** `implement(ep, (input, { request, session, setSession, redirect, env }) =>
  …)`.
- **Validation:**
  - paths are checked against pages and `http.redirects`;
  - an endpoint path under `/_hozu` is an error;
  - schemas are validated like queries.
- **What it serves:** webhooks, JSON APIs for apps, and the OIDC callback (0.6: `@hozu/auth-oidc`).
- **Principle 4:** side effects stay declared. An endpoint is a server-side declaration with a schema, not a view
  effect.

## D7. Measure it
- **Targets, stated before the runs** (the notes app, as in trials 0012–0013):
  - build ≤ 1.3× Nuxt;
  - a generated tasks feature ≤ 8 KB;
  - correctness unchanged.
- **One run with a second agent** (Codex) as well as Claude. The runs use the owner's plan quota, so they are run
  only after the owner says go.

## Order and release
- **Order:** D2 → D4 → D3 → D1 → D5 → D6. Then the scaffold, the skill, `examples/` and the site, then D7.
- **Breaking changes** (`ignore` in invoke states; fewer generated contracts) come with diagnostics and patches.
  The CHANGELOG has a migration section.
- **Gate green** at the end.

## Result (before D7)
- **D1:**
  - The TypeScript hints are in `hozu check`.
  - HZ044 has no false positives on any example app or on the site. It finds the seven cases in its catalog, and a
    scaffolded app with `ctx.error ? … : …` reports it at the source line.
- **D2:**
  - Done: `Invalid view child` names what it got, and `pending` is optional.
  - **Not done:** compiling the skill's code blocks in a test. The blocks are fragments, not files; this stays
    open.
- **D3:**
  - Examples keep their contracts. The bookmarks feature has 10 transitions, of which 1 is a decision.
  - Every lock file now carries summaries.
- **D4:** the derived `ignore` lists equal the hand-written ones. The IR hashes of the examples did not change.
- **D5:**
  - HZ045 reports nothing on the examples.
  - `hozu add widget` produces an app that checks clean and bundles.
- **D6:** endpoints are tested for GET, POST, 400, `Response` and `setSession`, and for HZ046 with patches.
  `examples/notes` serves `/api/notes`.
- **Size:** a scaffolded tasks feature (`--with detail,toggle,filter,remove`) is 10.5 KB, down from 14.0 KB.
  **The ≤ 8 KB target is not met.** The rest is views (4.8 KB) and model (4.2 KB).
- **Gate:** green, 282 tests; P3 130 ms, P7 7819 B, A4 61,691. The Chromium tests pass (46).
- **D7:** trial 0014 (`docs/trials/0014-0-5-notes.md`).
  - Correctness is 72/72.
  - Build is 1.80× Nuxt and change is 1.81× Nuxt, so the ≤ 1.3× target is missed. The difference from 0.3 is within
    the noise of two runs.
  - The remaining cost is reading the guide and the app, which 0.5 did not reduce.
  - The Codex run was void, because it hit the Codex usage limit.
