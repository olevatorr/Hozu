# ADR 0043 — 0.8: close the escape hatches (breaking)

- Status: accepted (2026-09-30). The owner took every recommendation, reviewed once more from the view that Hozu is
  an AI-first framework, with two changes: G4 removes soft navigation, and G10 folds 0.7.1 into 0.8.0. The waves run
  without a stop between them; each ends with a report.
- Motivation: trial 0020 (ADR 0042, `docs/trials/0020-long-run.md`). Over twenty sequential changes Nuxt had no
  regression in two runs. Hozu 0.7 kept low duplication and 10× less client JS, but:
  - its cost per change doubled from steps 1–10 to 11–20;
  - from step 16–17 both runs carried regressions that the agents reported as working;
  - `hozu check` was clean at every failing step.
- The owner asked for a complete, irreversible 0.8.0. This ADR is that proposal. Nothing is implemented yet.
- **Terms:** "principle N" is a principle of `CLAUDE.md`; "budget PN" is a `pnpm bench` budget (P7 client JS,
  P8 `navigate.js`, P9 req/s).

## Evidence base
- **Twelve studies**, each checked by an independent adversarial reviewer; the draft of this ADR was then reviewed
  from five further lenses (principles, facts, coverage, implementability, the agent's cost).
  - Nine studies were planned: data, forms, pages, i18n, lock, transform, cost, verify, growth.
  - A completeness critic added three: soft navigation, release, evaluation.
  - Root causes were confirmed against the source (file:line). Those marked "reproduced" were also run on copies of
    the trial apps.
  - The repro scripts are in the session scratch directory for now. Wave 0 commits them to
    `bench/trial/longrun/repro/` as expected-failure tests.
- **What the trial measured, by root cause:**

| Symptom in trial 0020 | Root cause (this ADR) | Section |
|---|---|---|
| DA1: a deleted account comes back (both runs, steps 17–20, silent) | the effect response recomputes queries with the pre-mutation session; soft navigation carries the previous page's store keys into the delete page; the scaffolded query resolver creates the user's list on read | B, I |
| N15: console error on `/admin` (run 1, steps 16–20, silent) | a page cannot answer 403, so `/admin` became hand-written endpoint HTML without the view-transition opt-in (the reference inlined it by hand) | D |
| Step 13 bulk actions, 851 k / 1 668 k (8.9× Nuxt) | forms read one value per name and drop the submitter. Run 2 then wrote a bulk endpoint, whose writes cannot invalidate: it spent about 37 of 102 calls probing and moved three queries to `'live'`. Run 1 used 100 slot fields. | C, A |
| Step 18 German, 591 k / 407 k (3.1×) | i18n prefixes every locale, English included; `<html lang>` only from the prefix | F |
| Step 6 tags, 407 k / 235 k (2.9×) | HZ018 with identical was/now after a route gained `search`; in run 1, soft navigation kept a stale machine, so the URL filter left old DOM next to new | G, I |
| Step 7 archive, both runs (2.1×) | HZ018 with identical was/now on the transitions entering an invoke that gained a failed branch (D6) | G |
| Step 10 undo (2.7×) | partly a per-session cache that survived sign-out (run 1, about 8 of 31 calls); the rest was not analysed | A |
| 1.1–1.8× on the defect-free steps 1–4, 8, 9, 14 (112 k vs 75 k) | guide re-read every session (+19 k), extra calls re-carrying the context (+11 k), no-JS behaviour verified twice, once by `hozu post` and once by `curl` on the started server (+6 k), contracts for copy-only transitions (+5 k). Starting the server is prompt-driven and equal in Nuxt. | K, G |
| 1.2× Nuxt's lines (+71 vs +58–62 per change) | voluntary contracts explain the per-step excess and most of the s20 gap: HZ058 as defined below flags 22 / 20 contracts (186 / 203 lines); none of them caught a regression | G |

- **One new defect family appeared during the research (D10):** soft navigation keeps a feature's app when only a
  view should persist, so seeds do not re-run.
  - In the trial's shape, a soft navigation into the delete page that carried the list page's store keys (D10c) was a
    necessary condition of DA1 with JS: 4 of 4 soft navigations failed, 0 of 4 document navigations.
  - This was measured with `hozu browse`, which does not deliver SSE.

## Principles and decisions this ADR asks to change (stop-and-raise)
None of these is bent quietly; each needs the owner's explicit yes.

| Principle / earlier decision | Change | Section |
|---|---|---|
| **Principle 8** (freshness list) | add `freshness: 'request'`, derived as a per-request region for either scope; `scope: 'user'` data is never cached across requests (`'request'` or `'live'` only) | A |
| **Principle 4** | add: query resolvers only read; writes happen in mutation and endpoint resolvers. It is not checkable: `hozu migrate`, the scaffold and `hozu docs data` enforce it | B |
| **Principle 4** | views may call `part()` helpers, which are authoring-time functions lowered like builder callbacks and inlined, so the IR holds no function (gate G11) | H |
| **Principle 2** | an endpoint form body is multi-valued exactly where the input schema declares an array; this is the declared rule for endpoints, which have no `ui.dom` reference | C |
| ADR 0005 D3 / D4 | superseded: no per-session partition cache and no cross-request dedup. **D2 stays** (public resolvers never see the session; HZ020) | A |
| ADR 0008 D3 ("HTTP status is derived" paragraph), ADR 0010 G5, ADR 0022 §1 | `head.redirects` (optional) → `head.failed`, required and exhaustive when the head query declares errors; a declared error maps to a route or to 403 / 404 / 410 | D |
| ADR 0010 G1 | a motion-less `ui.if` leaves the surface (gate G7) | H |
| ADR 0010 G6, ADR 0016 §1 | if gate G2 chooses a server-side store: sessions are no longer stateless signed cookies | B |
| ADR 0010 G11 | `/_hozu/live` sends a connection only its page's tags | B |
| ADR 0014 §1 | the `search` argument of `ui.link` becomes optional (omitted = all defaults); `null` and `{}` are type errors | G |
| ADR 0014 §5 | an invalid native post re-renders with status 400 | C |
| ADR 0015 (whole), ADR 0041 A's soft-navigation note, budget P8 | soft navigation is removed: every internal link is a document navigation with prerender and cross-document View Transitions | I |
| ADR 0016 §1 | `server.revalidate(tags): number` becomes `revalidate([tag()]): { entries, pages }` | A |
| ADR 0017 A1 (the owner chose (d) in phase 7c) | the default locale is unprefixed (c) | F |
| ADR 0021 §4 | `testApp` builds from the app module that `hozu serve` runs | E |
| ADR 0037 D3, Result | the lock must equal the computed lock; copy-only changes stay lock-reviewed even when a contract covers them; contracts over only mechanical transitions are HZ058 instead of "allowed as examples"; the examples drop them | G |
| ADR 0037 D5 | `hozu check` imports the declared app module (it runs app code) | D, E |
| ADR 0037 D6 | endpoint `output` becomes schema / `'redirect'` / `'response'`, with no HTML | D |
| ADR 0041 E, CLAUDE.md "SKILL.md ≤ 6 KB" | SKILL.md ≤ 4 KB with `changing.md` folded in (today 6 296 + 3 410 B) | K |
| ADR 0039 | `op.*` leaves the public surface (gate G7) | H |

## A. Data: user data is read per request; invalidation is exact
**Problem (D4a–f, all reproduced):**
- A mutation invalidates only `public` and the writer's own partition (`packages/data/src/runtime.ts:460`).
- Endpoints cannot declare `invalidates` (`EndpointIR`, `packages/core/src/ir/types.ts:95-100`).
- `server.revalidate` reaches only `public` and returns the number of ISR pages, which the agent read as "wrong tag"
  (`runtime-server/src/handler.ts:340-347`).
- `{ revalidate: 0 }` is HZ014, so `'live'` was the only way to avoid caching (7 uses in the trial; no change asked for
  push updates).
- An invalidation during an in-flight read is lost (`runtime.ts:342-353`, D4e).
- In-flight dedup across requests returns pre-write data, also for `'live'` (`runtime.ts:369-377`, D4f).
- The partition key is the session value, so a user's cache survives sign-out and sign-in (run 1 step 10).
- HTML responses carry no `Cache-Control` or `Vary`, while HZ038 forbids authors to set them "because it is derived"
  (reproduced).

**Options:**
1. Keep per-session partitions and invalidate all of them with a global tag index and generations.
   - It keeps an unbounded set of partitions keyed by the session value, which survives sign-out, so an LRU would be
     needed.
   - The trial never needed a user cache.
2. **Read user data per request.** `'request'` (one read per request) and `'live'` (per request plus push) are the only
   freshness values for `scope: 'user'`.
3. Make `'live'` the default for user data. This bends principle 9 and ADR 0022 (freshness decides behaviour).

**Decision: 2, with exact invalidation for public data and ISR, and derived HTTP caching.**
- **Freshness:**
  - `query({ scope: 'user', freshness: 'request' | 'live' })`; anything else is **HZ049 cached-user-data**, with a
    patch to `'request'`.
  - `'request'` is also valid for public data, where it replaces `{ revalidate: 0 }`.
  - The compiler maps `'request'` to mode `request` in any scope (`compiler/src/plan.ts` `own()`), so a public
    `'request'` query makes its page uncacheable. `hozu plan` and `hozu check` print that as info.
  - The data topic says: public data is `'static'` with tags unless it changes without a declared writer.
  - `'live'` without tags is **HZ050 live-without-tags**: it would behave like `'request'` (principle 1).
- **Per-request memo:** `data.scope()`, one per request and shared by head, views, effect and form post, replaces the
  partitions.
  - It is cleared after a mutation, and there is no cross-request dedup.
  - Resolvers of queries, mutations and endpoints receive the schema-parsed input (defaults and transforms applied),
    and the memo keys on it.
- **Endpoints:** `endpoint({ …, invalidates: (input) => [tag()] })` applies when the resolver succeeds (JSON, redirect,
  or a Response with status < 400). A GET endpoint with `invalidates` is **HZ062 get-endpoint-invalidates** (warning:
  e-mail links are legitimate).
- **`server.revalidate([notesTag()])`** takes tag uses, not strings, returns `{ entries, pages }`, and is documented in
  `topics/data.md`.
- **Generations:** every cache entry and ISR page has one. A refresh stores its result only if the generation did not
  move while it ran (fixes D4e and its ISR twin at `handler.ts:314-337, 409-420`).
- **Derived HTTP caching:**
  - a cacheable plan sends `public, max-age=0, must-revalidate`;
  - any page, effect, query, form re-render or endpoint response that read the session sends `private, no-cache`,
    plus `Vary: Cookie` when the project declares a session;
  - HZ038 stays, now true.
- **Cost:** budget P9 (req/s, cart home with `{ swr: 30 }` user data) will move. It is report-only; the shift is
  expected and written down here.

## B. Sessions: a session change is a barrier
**Problem:**
- **D9a** (deterministic; the only cause in run 1): the effect recomputes every key the client sent with `who`, read
  before the mutation, and ignores the tags (`handler.ts:360-378`).
- **D9b:** the SSE tag message is broadcast before the response that carries `set-cookie` exists
  (`handler.ts:341-345, 366`). This ordering was reproduced in-process only; `hozu browse` never delivers SSE, so the
  live path is unverified in a browser until J lands.
- **D9c:** the session cookie is `base64(JSON) + HMAC`, with no id, issue time or expiry. The same value always signs
  to the same token (`runtime-server/src/session.ts:40-63`), and the token is readable.
  - D9c is not needed for DA1. It matters on its own: after deleting the account, the old cookie still got a 200 on
    `/notes` (reproduced).
  - The Nuxt apps used server-side sessions, so their old cookies died with the account.
- **D9d:** the query resolver scaffolded by `hozu add feature --with auth` creates the user's list on read
  (`cli/src/commands/scaffold.ts:353-359`).
  - Both trial apps inherited it at s00.
  - Speculation prerender runs GET-page queries, so such a resolver can write when a link is hovered.
- **The reference app passed DA1 by accident:** its `deleteAccount` had no `invalidates`.

**Decision:**
- **Server:**
  - The effect recomputes with the post-mutation session: every `'request'` key the client sent, plus the other keys
    whose tags intersect the invalidated ones.
    - `'request'` means "read on every request", including the effect response.
    - `invalidates` drives the client refresh for every freshness, and SKILL.md says so.
  - A native form post renders with the new session (`handler.ts:484`).
  - The response carries a derived `session: true` when `setSession` ran. It is derived, not declared (see
    Rejected).
  - The SSE broadcast happens after the response is built.
  - `setSession` inside a failing mutation still applies (session expiry: `setSession(null)` then
    `fail('Expired')`). This is kept on purpose and documented.
- **Client:**
  - While an effect is in flight, tag messages are queued.
  - `session: true` drops the queue and replaces the store with `refreshed`. Every navigation is a document navigation
    (I), so no page carries another page's store.
- **Query resolvers only read (principle 4 amendment):**
  - `hozu migrate 0.8` recognises the scaffold's generated `itemsOf` shape and splits it into `listOf` (read-only) and
    `ownListOf` (mutations only).
  - It prints every other `implement(<query>, …)` body that calls `set`, `push` or `unshift`.
  - The scaffold and `examples/notes` use the split, and `hozu docs data` states the rule.
  - A resurrection like DA1 remains possible in user code; `hozu browse --as … --js both` (J) is the net.
- **Scoped live:** `/_hozu/live` sends a connection only the tags its page subscribed to (the `payload.live` tags the
  client sends). This stops refetch storms and incidental broadcast of other users' parameterised tags. It is not an
  access control: tag timing stays observable.
- **Session stores (gate G2):**
  - A **server-side store** with an opaque id (default `memorySessions()`). It fails closed on restart and does not
    expose the payload.
  - Or a **stateless token** with an id and an expiry, plus a revocation list. That list fails open on restart.
  - Either way the store is per instance. On edge or multi-instance deployments (`examples/cart/edge.ts`),
    `memorySessions()` loses sessions across isolates, and a revocation list does not propagate.
  - A shared store (KV, Redis) is an external service that needs the owner's approval (ADR 0016 §1, cost rules), so
    edge entries pass a store explicitly.
  - Production without `SESSION_SECRET` is an error.
- **Tools get real sessions:** `--session <json>` mints a real session at the start of a chain through the app's own
  store (`sessions.issue(value) → cookie`, implemented by both store kinds).
  - After that, `setSession` and sign-out behave as in production.
  - Each `--as <name>` actor may take its own `--session`.
  - There is no fixed-identity mode. 0.7's function-form session discarded `setSession`, so a sign-out never happened
    in the tools.

## C. Forms: every value, every button, one decoder
**Problem (D3, D5 and step 13):**
- There are three single-value decoders with different rules:
  - the client's `ui.dom.form` uses `new FormData(form)`: the last value wins and the submitter is missing;
  - a native post: the first value wins;
  - an endpoint body: `Object.fromEntries`.
- `ui.dom.form(name)` is typed `Expr<never>`, so it can be assigned to `z.array(…)`.
- HZ033 treats arrays as text and does not count submit buttons as options. Its boolean advice (`ui.dom.checked`) is
  HZ027 on submit.
- A primitive cannot be removed from a list (`removeWhere` needs a key), and there is no `includes`.
- `hozu post`, `hozu get --forms` and `@hozu/testing` cannot see checkboxes, `form=`-associated controls or the
  submitter.

**Decision:**
- **Values:**
  - `ui.dom.formAll(name): Expr<never[]>` is all values in tree order (`[]` when empty), IR
    `{ ref: 'dom', path: ['formAll', name] }`.
  - `ui.dom.form(name): Expr<never>` stays and means the first value on both sides.
  - Both include the submitter: the client uses `new FormData(form, e.submitter)`.
  - One shared decoder, `formEntries(entries, submitter?) → { first, all }`, is used by client, server and tools.
  - `formRunnable` and HZ027's field table gain `formAll`, and HZ036 treats `formAll` and the submitter as
    server-runnable.
- **Endpoint bodies:** a field is multi-valued exactly when its input schema property is an array (the principle 2
  row above).
- **Buttons:**
  - HZ033 accepts submit buttons only when every submit button of the form shares the name and has an enum-member
    literal value; otherwise the field must be nullable.
  - For a boolean or number field fed by `ui.dom.form` on submit, HZ033's fix becomes form-safe: a list field with
    `ui.dom.formAll(name)` (checked = `['on']`) or a literal radio pair, and a text field parsed in the mutation
    input. Its catalog case asserts that no HZ027, HZ033 or HZ036 remains after the fix.
  - A submit button with an `on.click` send is **HZ056 submit-button-click** (warning): both the click and the submit
    run.
- **Controls outside the form:** `const bulk = ui.formRef()` is a declaration identity (principle 3).
  - It is declared at module level and needs no export.
  - Its id derives from the node id of the form that holds `ref: bulk`. Inside `ui.each` it gets one id per item key,
    and a control may reference it only from the same `ui.each` scope.
  - `ui.input({ form: bulk })` refers to it. A string `form` attribute is HZ014, with a patch that introduces a
    formRef.
- **Diagnostics:**
  - **HZ054 single-value-form-read:** `ui.dom.form` feeds a list field, or several controls share the name in one form
    instance (radio and submit groups excluded). The patch rewrites it to `formAll`.
  - **HZ055 unknown-form-field:** no control with that name belongs to the form (did-you-mean fix). When the form
    holds `ui.html`, a widget or controls from another view, the same finding is **HZ063 unknown-form-field-opaque**
    (warning).
  - **HZ061 constrained-form-payload** (warning): an event payload fed by `ui.dom.form` / `formAll` declares
    constraints (min length, pattern, minimum). Limits belong in the mutation input, where both modes see the same
    `Invalid`.
- **Lists:**
  - `ctx.l = ctx.l.filter((x) => x !== v)` lowers to `removeWhere(path, null, v)`, where the key is null (compare the
    element itself; scalar item schemas only).
  - `list.includes(v)` lowers to the builtin `%includes`, which ships in `fns.js`.
- **No-JS posts:**
  - An invalid native post re-renders the page with status 400 and the framework `Invalid` error in the snapshot. That
    is the branch a JS submit reaches through the mutation's schema check.
  - It is checked on the server only, because ADR 0013 rejected client-side runtime checks for budget P7. HZ061 keeps
    the two modes from diverging.
- **The "select many" guide pattern** disables the checkboxes while the machine is busy, because invoke states drop
  events.
- **Tools** (all in `hozu browse --js off` steps, J; nothing is added to `hozu post`):
  - `fill` appends for a repeated name, `check` / `uncheck` set the state, and `click <button>` submits with its
    name/value.
  - `hozu get --forms` lists checkbox groups (with unchecked values), formRef controls and submit buttons.
  - `testApp().post` accepts `[string, string][]`.

## D. Pages and endpoints: no hand-written HTML
**Problem (D7 and every place the apps left the IR):**
- A failing head query answers 303, 500 or 404 only (`render.ts:393`); there is no 403.
- The redirect's `Location` ignores `basePath` and the locale (`render.ts:392`, reproduced).
- Endpoints return JSON or any `Response`. So `/admin` was hand-written HTML in run 1 and in the reference, without
  CSP or nosniff.
- Ghost routes (a route with no page) existed only so that `ui.link` could point at an endpoint.
- A schema endpoint cannot answer 401 (step 19).
- The handler parses the body before the resolver runs (`handler.ts:559-565`), so no endpoint can verify a raw-body
  webhook signature.
- A missing resolver (HZ021) shows up only when a server or `hozu get/post/browse` builds the handler, and then only
  as a usage error without a location.

**Decision:**
- **Pages:**
  - `head.redirects` becomes `head.failed`. Every declared error of the head query maps to a parameterless route
    (303) or to `403 | 404 | 410`, and the mapping is exhaustive.
  - 429 and 451 are excluded, because a page status is cached with the page (principle 8).
  - A missing, extra or `Unexpected` key is **HZ051 unmapped-head-error**. At check time it has no patch: its snippet
    lists the choices per error name (`Unauthorized: <sign-in route>`, `Forbidden: 403`, `NotFound: 404`,
    `Gone: 410`).
  - Only `hozu migrate 0.8` fills `404` (the 0.7 behaviour), and it prints every error whose name suggests another
    status.
  - `Location` is built with `routeTable(ir, locale)` and `basePath`.
- **Endpoints**, in the shape of mutations:
  - `errors: { Name: schema }` as in a mutation, mapped with `failed: { Unauthorized: 401 }` (the word `head` uses;
    statuses `400 | 401 | 403 | 404 | 409 | 410 | 422 | 429`). `fail(name, payload)` answers
    `{ error, message, fields? }`, and `Invalid` stays framework-owned.
  - `output` is one of:
    - a schema (JSON);
    - `'redirect'`, where the resolver returns `redirect(ui.link(route, params, search?))`;
    - `'response'` for bodies that are neither JSON nor HTML (file downloads, SAML HTTP-POST binding). A `text/html`
      response is a 500 with **HZ053 html-from-endpoint**, which the handler reports and the tools print.
  - `input: 'raw'` gives the resolver `ctx.bytes`, and the body is not pre-parsed (raw-body webhook signatures).
  - Every endpoint response carries nosniff and referrer-policy. Speculation exclusions (`/_hozu/*`, GET endpoint
    paths) are built with `basePath`.
  - A GET endpoint may call `setSession`, because auth callbacks are GET by protocol. OIDC form_post callbacks use
    `'redirect'`.
- **Which redirect to use** (one per purpose, principle 1):

| Need | Form |
|---|---|
| a static path moved | `http.redirects` |
| this visitor may not see the page (a declared error of the head query) | `head.failed` |
| a decision on success, e.g. `/` by session (step 9) | a GET endpoint with `output: 'redirect'` |
| after a machine transition | `navigate` |

  - `head.failed` maps declared errors only. A head query that always fails is not a redirect, and `hozu docs pages`
    says so.
- **Links:**
  - `ui.link(endpoint, input)` is the internal URL form for an endpoint. A GET endpoint's input follows HZ035 (flat
    scalars, schema coercion).
  - For a POST endpoint, `ui.link(endpoint)` is also the value of `form.action` / `button.formaction` of a native form
    (no input; HZ046 checks the form's method and, for literal field names, the input schema).
  - `exports` gains `endpoints`: linking to another feature's endpoint requires it to be exported and imported
    (HZ006).
  - A route that no page renders is **HZ052 unserved-route**. Its patch moves the links to the endpoint only when the
    endpoint's output is a schema or `'redirect'`; when it is `'response'` there is no patch, and the fix says to make
    a `ui.page` with `head.failed`.
  - HZ032 extends to `form.action`, `button.formaction` and `%concat` hrefs that start with `/`.
- **The app module:** see E. `hozu check` imports it, runs the app's module code, and reports HZ021 with a location and
  a fix. The CLI no longer wraps `DataRuntimeError` as a usage error.
- **The lock** gains a `pages` section that summarises the head error mappings, the endpoint status and redirect
  tables. Changing who gets a 403 is therefore a reviewed change (principle 5).
- **Fallback pages:** the framework's own error pages carry the view-transition opt-in.

## E. One app module for the tools and production
**Problem:**
- `hozu get/post/browse` build their own handler from `createResolvers()` with a random secret, and never run
  `serve.ts`.
- The agents patched `res.writeHead` (404 → 403) and rewrote `<html lang>` there, so the tools verified a different
  app than `npm start` served.

**Decision:**
- **One module:** `project({ app: new URL('./app.ts', import.meta.url) })` names the one app module. No command finds
  a file by its name (principle 2).
- **What it exports:** `export default app({ resolvers, session, widgets })`, which is the handler options without
  `env`, `readFile`, `publicDir` or a port.
  - The build and styles come from the project.
  - The resolvers are named only here: `serve.ts` and `createResolvers()` disappear from apps.
- **Who reads it:**
  - `hozu serve` adds the port, `env`, `publicDir` and adapter-node (it honours `PORT`).
  - `hozu check`, `hozu get`, `hozu browse` and `testApp(app)` build from the same options. They may only replace the
    session store with a test issuer, which `hozu serve` never enables.
  - Edge entries pass `app` to `createHandler(app, { render, manifest })` (ADR 0016).
- **No wrappers:** there is no wrapper position. Headers go through `project({ http })`, statuses through `head.failed`
  and endpoint `failed`, `lang` through F.
  - A default export that is not an `app(…)` is **HZ045**, now an error, counted by `runCheck` by severity.
- **`package.json`:** `scripts.start` is `hozu serve`. The trial's acceptance starts 0.8 apps with it.

## F. i18n: the default locale keeps its URLs
**Problem (D8):**
- `site.locales` prefixes every locale, English included (`/notes` → 307 `/en/notes`), and negotiates by
  Accept-Language.
- `<html lang>` comes from the prefix or the static `site.lang`, and `ui.messages` needs `site.locales`.
- Turning i18n on changed every contract's expected URL (HZ015), contradicting HZ041.
- Both runs and the reference built their own language switch, in the session, an AsyncLocalStorage and a `serve.ts`
  rewrite. One variant leaked the language across visitors through the shared `user:null` partition.

**Options:**
- (c) the default unprefixed, the others prefixed;
- (c) plus a framework locale-preference cookie;
- (a) one URL whose language depends on a cookie (breaks shareable URLs and ISR keys);
- keep (d) and add `head.lang`.

**Decision (gate G3): (c), URL-only.**
- **URLs:**
  - `routeTable(ir, l)` prefixes only when `l !== site.lang`. `/en/x` → 308 `/x`. There is no Accept-Language
    redirect.
  - `lang` is derived per request from the URL.
  - Contracts use the default table, so enabling locales changes no contract.
- **Why this answers ADR 0017's objection** ("a URL's locale has two answers"):
  - Under (c), every (page, locale) pair still has exactly one canonical URL, and URL → locale is a total function.
  - Under (d), an unprefixed URL already had a second meaning: the negotiating 307.
- **Diagnostics:**
  - A page route whose first literal segment is a declared locale is **HZ060 locale-path-collision**.
  - HZ037 and HZ046 compare redirect keys and endpoint paths against every locale's `routeTable(ir, l)`. Endpoints and
    redirects are matched before the locale split, so `/de/api` is legal.
  - `%cond` accepts Href values, so `locale === 'en' ? ui.alternate('de') : ui.alternate('en')` lowers (it is HZ014
    today).
- **Security:** `internal()` rejects `/\` as well as `//`; the preview exit's open redirect was reproduced.
- **Step 18 is expected, not yet run:** the navigation resolves `ui.link` in the page's locale, so signing in on
  `/de/login` lands on `/de/notes`, signing out on `/de/login`, and a reload keeps the URL.
  - Before G3 is decided, the reference's `18.patch` is rewritten under (c), and DE1 / DE2 are run.
  - A new visit to an unprefixed URL shows English.
- **Guide:** `hozu docs i18n` opens with: the URL holds the language; reload, sign-in and sign-out keep it; do not add
  a cookie, a session field or a server rewrite.
- **Deferred:** the locale-preference cookie is not in 0.8. It is additive later if a trial asks for it; it would bend
  principle 2 and ADR 0016's "a redirect never hides a page".

## G. Lock and contracts: review what a transition decides, and nothing else
**Problem:**
- **R1 (D1):** the behaviour hash covers `navigate.search`, but the summary does not print it. So
  `ui.link(home, null)` → `ui.link(home, null, {})` is HZ018 with identical was/now.
- **R2 (D6):** a transition's hash includes the entered state's whole invoke (`done` / `failed`), which have their own
  entries. A new failed branch therefore flags the entering transition (trial step 7).
- **R3:** "covered by a contract" disables lock review even for a copy-only transition.
  - A renamed contract counts as changed.
  - Growth of `initialContext` "changes" every contract, which laundered one decision in run 2 step 13.
- **R4:** 13 of 42 snapshots had a lock that differed from the computed one and still printed `lock checked`.
  - 17 new transitions never entered any committed lock (`lock.ts:86` skips new entries).
  - A missing lock file skips the review entirely (`cli/src/commands/validate.ts:85`).
- **R5:** a `fn` body change is hashed but not printed, and a `fn` used in `navigate` is not hashed at all.
- **Mechanical vs deciding is inconsistent:**
  - `ctx.n += 1` lowers to `inc` (mechanical) and `ctx.n = ctx.n + 1` to `%plus` (deciding).
  - A comparison in a value (`ctx.searching = e.text !== ''`) counts as mechanical.
- **The guide:** `create-hozu/templates/guide.md:25` says "Every behaviour change comes with a contract change",
  against ADR 0037. At s20 each app had 31 contracts for 6 / 9 decisions. The guide line is a plausible cause, not a
  proven one.

**Decision:**
- **What "decides" means (normative):** a transition decides when it has a guard or a navigate, or when an assign
  value or the entered invoke input contains a `fn`, a comparison, or a computing builtin (`%plus`, `%minus`,
  `%concat`, `%cond`, `%coalesce`, `%includes`, `%length`).
  - `ctx.x += v` and `ctx.x = ctx.x + v` lower to one IR, the computing one.
  - HZ016, HZ018 and HZ058 all use this definition.
- **Lock v2 entry:**
  `{ behavior, summary, decides, fields: { guard, assign, navigate, enters, fns }, contracts }`.
  - `behavior` hashes what the transition decides: trigger, guard, target, assign, the normalised navigate, plus the
    entered state's effect, input, timers and `final`, plus the `sourceHash` of every referenced `fn`, those in
    `navigate` included.
  - The summary prints every hashed field, so identical was/now becomes impossible.
  - `contracts` stores normalised body hashes (`given` minus `initialContext`, `expect` minus `given`, `when`,
    `effects`), so context growth changes no entry.
- **Link search:**
  - `ui.link(route, params)` is valid for any route; omitted means all defaults (ADR 0022's "nothing configured").
  - `search` is omitted or a non-empty partial. `null` and `{}` are type errors, and `hozu check` translates the TS
    error ("omit the third argument; omitted means every default").
  - A literal equal to the default folds in the IR.
- **Acceptance:**
  - A copy-only change is accepted by `--update-lock`, even when a contract covers it.
  - A change to a transition that decides, before or after, is accepted only if at least one covering contract fails
    when run against the previous record (stored in `fields`). Renames, added trivial contracts and context growth do
    not count.
  - HZ018 lists the changed fields first; its text no longer says a covered copy-only transition "makes a decision".
- **The lock equals the computed lock:** any difference is **HZ057 lock-out-of-date**, an error. That covers:
  - a changed copy-only entry;
  - a new or removed transition;
  - a changed contract map;
  - a v1 file;
  - no lock file in a project that has a machine. `lock: 'missing'` exists only without a machine, and the scaffold
    writes the first lock.
- **HZ057 reporting:**
  - One diagnostic per machine, listing at most 10 entries (the full list with `--json`). The location is the owning
    state, or the machine for a removed state or a file.
  - Its fix is `hozu check --update-lock` (gate G5), and it asks the agent to list the accepted `now:` lines in its
    final summary, so the owner has something to review.
- **Contracts only for decisions:**
  - `guide.md:25` is corrected, with a test that it matches ADR 0037.
  - `examples/bookmarks` (the skill's `example/`) keeps only its decision contract.
  - **HZ058 contract-without-decision** (warning) fires when every step of the contract is mechanical. Contract runs
    record every evaluated guard (taken or rejected), and a rejected guard counts as a decision, so negative
    specifications survive.
  - HZ058 is reported once per feature as a summary (`12 contracts cover no decision: a, b, c … — see hozu docs
    contracts`), one entry per contract with `--json`.
  - Its fix only names the lock entry that already reviews the transition. It has no patch and never suggests
    deletion.
  - An IR-identical duplicate contract is **HZ064 duplicate-contract** (error).
- **Migration:**
  - `hozu migrate 0.8` runs before the dependency upgrade. It loads the app's installed 0.7 `@hozu/core` and
    `@hozu/validator` (as `hozu get` does), computes the v1 lock on the unmigrated source, and lists the entries that
    are already stale under 0.7.
  - The 0.8 validator never hashes v1: any v1 file is HZ057.
  - Nothing is accepted implicitly.

## H. Authoring: no silent JavaScript on references
**Problem:**
- **D2:** a plain helper called from a render callback evaluates `?:`, `&&` and `===` on the placeholder (every note
  showed `Unpin`), and nothing reports it. It was met once, in the reference app; agent code had 0 occurrences.
- **T2:** `.length` of a `fn()` result is `undefined`.
- **T3:** a `fn` whose `impl` is a named function ships without the helpers it calls (ReferenceError in `fns.js`).
- **T5:** `Boolean(ref)`, `Array.isArray(ref)` and `Object.keys(ref)` run silently.
- **T6:** the diagnostics still teach `op.*`, which the guide never shows.
- **T7:** a template-string `href` bypasses HZ032.

**Options for reusable view logic:**
- (a) HZ059 only, with the fix "inline the helper into the callback or split a `ui.view`";
- (b) `part()`.

**Decision:**
- **Loud references:** evaluating a reference as JavaScript is **HZ059 reference-escape**.
  - Statically, the transform finds references passed to plain functions or globals, and plain identifiers used as
    builder callbacks, and lists all of them like HZ047.
  - At record time, `toPrimitive`, `valueOf`, `toString`, `ownKeys` and `has` traps throw with the location.
  - Like HZ044 and HZ047, the server refuses to start.
- **Reusable view logic, gate G11, recommended (b):**
  - `part((…) => …)` returns a branded declaration and is lowered like a builder callback. It is inlined at record
    time, and the IR is identical to the inline form.
  - It can produce a view subtree, a value or a guard, never an assign.
  - A plain helper that receives a reference is HZ059, whose fix is to make it a part, so there is one spelling.
  - A part that references no feature declaration may live in a shared module. A part that references a declaration
    belongs to that feature, and inlining it from another feature is HZ006 at record time. `hozu map` lists parts
    with file:line.
  - Why (b): views are the largest category of the trial apps (342 lines of run 1's s20), and (a) would push reuse
    into `ui.view` splits, which change the render plan.
- **Record-time normalisation:** one meaning, one IR (a guard's `%cond` → and/or, a child `%cond` → `if`, `+=` ≡
  `x = x + v`). This is the precondition for the part and codemod equivalence tests.
- **Branches:** a `?:` or `&&` branch may be a `Child[]`. It lowers to `if`, the only spelling for several nodes, and
  `Child` gains that case only in branch position.
- **Call results:** results of `fn`, `message` and the builtins are expression proxies. `.length` lowers to `%length`,
  and any other member access throws.
- **Named impls:** a named `impl` carries its helper closure. A namespace-import `fn` call is fixed in `isRef`
  (`transform.ts:282`).
- **`op.*` and the motion-less `ui.if` leave the public surface (gate G7).**
  - `c ? a : b` and `c && a` are the only conditional forms; `ui.if` exists only with a motion name.
  - The diagnostic texts are rewritten without `op.*`.
  - Agents wrote `op.*` and `ui.if` 0 times in 42 sessions. The repository's examples use them heavily (notes 27,
    cart 15, showcase 21).
- **HZ032** checks `%concat` hrefs (with D).

## I. Soft navigation is removed (gate G4: remove)
**Problem (D10, reproduced in Chrome):**
- Persistence is derived per view (`compiler/src/plan.ts:248-256`), but the app kept is per feature
  (`runtime-client/src/navigate.ts:106-111`).
- A kept feature's app skips re-mounting (`hydrate.ts:177-178`) and claims DOM rendered with a new context. So the
  seed does not re-run, the search is frozen, and old and new DOM coexist.
- Routes whose search has non-null defaults never match on the client (`navigate.ts:24-36`), so `hozu plan` and the
  runtime disagree.
- The store is never pruned, which is how the delete page sent `listNotes` in DA1.
- No change request and no acceptance check needed soft navigation. Its behaviour is derived and invisible: neither
  `hozu check`, the contracts nor the lock can see what persists.

**Options:** fix and narrow (a per-feature fixpoint, stateful views only, a soft table in the lock), or remove.

**Decision: remove (the owner, from the AI-first review).**
- An agent cannot verify what it cannot see. Fixing the derivation would add rules to learn and a lock table to
  review, for a behaviour no trial asked for.
- **Deleted:** `runtime-client/src/navigate.ts` and the `navigate.js` chunk, `payload.soft`, the view boundary
  comments, `RoutePlan.persistent` and the plan's soft section, the speculation exclusions and CSP hashes that exist
  only for it, the Navigation API code, and budget P8.
- **What remains:** every internal link is a document navigation, with speculation prerender and the cross-document
  View Transition opt-in (ADR 0032), which already exist.
- **State across pages** lives in the URL (seed), on the server (queries) or in a widget's own storage. ADR 0015's
  product case (a panel keeping machine state across links) is withdrawn; the cart panel re-renders from server data.
- **Consequences:**
  - B's barrier needs no store pruning;
  - F's locale switch is always a document navigation;
  - D10 cannot occur.
  - The bytes freed in budget P7 are measured and added to the reserve.
- **Order:** it is the first task of wave 2, because B, C and F then build on a runtime without it.

## J. Verification: make the failures visible where agents look
**Problem:**
- **Nine silent step-runs:**
  - JS verification (`hozu browse`, in 6 of 9) was always one user in one session.
  - Every cross-user consequence (the admin table, the recipient's view) was checked with `curl` or `hozu post`,
    without JS.
- **Wrong advice:** `testing.md` says "Two users: run two commands", which is wrong with an in-memory store. 0.7 can
  switch users inside one `browse` chain and reproduces DA1 that way, but no guide says so.
- **`hozu browse` blind spots:**
  - it waits for whole responses (`browse.ts:252`), so SSE never arrives and every step on a live page waits the 8 s
    cap;
  - it reports speculation-prerender errors without a URL (`browse.ts:276`);
  - it has no Log domain, so CSP violations are invisible;
  - it cannot keep two users open at the same time, and cannot switch JS off.
- **Broken builds still render:** `hozu get` answers 200 and exits 0 while the build has errors.

**Decision:**
- **The engine:**
  - it streams SSE and ignores `text/event-stream` when settling;
  - speculation prerender goes to the in-process handler;
  - errors carry `url` and `type`;
  - the Log domain is on;
- **`hozu browse --as <name>`:** several actors, each with its own browser context and optional `--session`, in one
  in-process world. It is for simultaneous actors (live sharing); switching users within a chain keeps working.
- **`hozu browse --js on|off|both`, default `both`:**
  - `--js off` is the same Chrome session with `Emulation.setScriptExecutionDisabled`, so the element finder and the
    text extraction are the same. Without Chrome, `browse` is a config error; `hozu get` remains the browser-free
    read.
  - Every target-taking step accepts `in "<text>"`, which scopes it to the smallest list item, table row or form
    containing that text (`click Pin in "Buy milk"`). `press Enter` and `submit "<form label>"` let one step list
    drive both modes.
  - A step whose target has no native effect without JS prints `js-only (<derived reason>)` in the off column. A
    difference is reported only when both modes made a request or navigation and the resulting text differs.
  - Per step, it prints only the lines that step added or removed, per mode only where they differ. A passing six-step
    run is capped at 1.5 KB, with a size test like `map`'s.
  - It replaces `hozu post` and its `--next` step language (gate G8): one step language and one no-JS path
    (principle 1).
- **Broken builds:** `hozu get`, `hozu browse` and `testApp` print the build's errors and exit 1 without rendering when
  the build has any error.
- **Tests:** browser tests in `pnpm test` skip without Chrome and stay within a stated time.
- **The guide:** any statement a change makes about other users, other pages, after a reload or after sign-out is
  verified once in one `browse` chain with `--js both`. The "two commands" advice is deleted.
- **Scenarios** (`scenario()` + `hozu verify`) are deferred (gate G9):
  - unmandated artifacts went unused (`@hozu/testing` 0 times, `hozu add` 0 times in steps 1–20);
  - a scenario form would be a third way to state behaviour next to contracts and `testApp` (principle 1);
  - its selectors are display text (principle 3, broken by step 18);
  - DA1 crosses three features (principle 6).

## K. The fixed cost of a change
**Problem:**
- The defect-free steps cost 112 k against 75 k (1.49×).
- SKILL.md (6 296 B, over the CLAUDE.md budget of 6 KB and untested) and `changing.md` (3 410 B) were read in all 40
  change sessions. 2 439 B of SKILL.md is the build-only "feature in one screen".
- In the 14 sessions of the seven defect-free steps, 11 ran a command to learn how to sign in for a test.
- An upgraded app keeps its 0.7 `CLAUDE.md` block. That block tells the agent to read `changing.md`, to use
  `hozu post`, and that "every behaviour change comes with a contract change", and `hozu skill` does not overwrite
  it.

**Decision:**
- **SKILL.md ≤ 4 096 B, frontmatter included**, enforced by a test that checks the size and that each listed rule is
  present. It holds:
  - the change loop and the topic index;
  - `changing.md`'s "What to touch" table with its per-item row, kept because ADR 0041's Result showed a regression
    when that row left the first file read;
  - only the rules no diagnostic enforces: query resolvers only read; verify other users, reload and sign-out in one
    `browse` chain with `--js both`; contracts only where a transition decides; `'live'` only for push;
    `invalidates` drives the client refresh.
- **What moves out:**
  - Rules a diagnostic enforces (`formAll`, `part`, `head.failed`, freshness) are taught by that diagnostic.
  - The build example moves to `hozu docs feature`, and its test moves with it.
- **`hozu map` starts with:**
  - the session shape;
  - the verify line (`npx hozu browse <path> --session '…' --js both`);
  - the files and their roles.
  - It keeps its 2 KB budget for the bookmarks and trial-0007 fixtures, and gets a stated budget for
    `examples/notes`.
- **Upgraded apps get the new block:**
  - `hozu migrate 0.8` and `hozu skill` rewrite the Hozu block of `CLAUDE.md` / `AGENTS.md`. They add markers on the
    first run, replace the file when it equals a known 0.7 template, and otherwise print the block and exit 1.
  - The 0.8 template drops the loop that SKILL.md already has, and the contract rule.
- **Cost:**
  - Expected savings: guide 19 k, contracts 5 k, the duplicate no-JS verification 6 k. E makes `hozu get/browse` and
    the started server the same app, and the guide says so.
  - New costs: about 3 explicit `--update-lock` calls per run over steps 13–20, the HZ057 / HZ058 output, and the
    two-column browse output.
  - The net is not estimated; trial 0021 measures it.

## AI-first acceptance conditions (from the owner's review)
0.8.0 is done when an agent can use it cheaply and cannot fail silently. Every section above is held to these:
1. **Every new diagnostic carries a fix an agent can apply:** a patch, or an exact snippet. HZ051 is the one
   deliberate exception, because 403 vs 404 is an intent decision.
2. **Output stays small:** HZ057 and HZ058 report per machine or feature, and the `hozu map` and `hozu browse` outputs
   have size tests.
3. **Upgrading rewrites the agent's instructions:** `hozu migrate 0.8` and `hozu skill` replace the app's `CLAUDE.md`
   / `AGENTS.md` Hozu block. Otherwise an upgraded agent follows 0.7 rules.
4. **SKILL.md holds only what no diagnostic enforces;** the rest is taught at the moment of the mistake.
5. **A broken build never renders:** `hozu get`, `hozu browse` and `testApp` exit 1 with the diagnostics.
6. **The release is judged by trial 0021** against ADR 0044's registered targets, not by "the code is written".

## Rejected or deferred, with reasons
- **`machine({ failed })` (shared failure branches):** it would silently absorb a forgotten error that HZ004 and the
  types catch today. Deferred; the guide shows a shared `const` instead.
- **`scope: 'signedIn'` + `project({ signIn })`:**
  - It changes principle 8's scope list, and it makes auth depend on which view reads which query (principle 2).
  - It could loop on the sign-in page.
  - Deferred to a design of page access, together with D.
- **Declared session writes (`mutation({ session: true })` + a navigate rule):** the runtime already knows whether
  `setSession` ran, which is enough for B. The flag would also decide behaviour, so it would have to be required
  (ADR 0022).
- **A framework locale cookie:** see F.
- **Framework-reserved error names (`Forbidden` → 403 automatically):** a hidden mapping (principle 2);
  `head.failed` states it.
- **`output: { file: contentType }` instead of `'response'`:** it would make the no-HTML rule static. It is rejected
  for 0.8 because SAML POST binding and streaming downloads do not fit one content type. HZ053 checks at runtime.
- **Readable no-JS action ids (`?__hozu=notes.Pin`):** almost no cost effect, and they invite `curl` verification.
- **Change-level generators (`hozu add action`):** unused in the change steps. Revisit after K.

## Diagnostic codes (allocated here, in one block)
The global numbering rule applies: nobody allocates "max + 1" during implementation. HZ065–HZ069 are reserved for 0.8
findings and are assigned only by amending this table. Severity is one per code.

| Code | Name | Severity | Fix (summary) | Section |
|---|---|---|---|---|
| HZ049 | cached-user-data | error | patch: `'request'` | A |
| HZ050 | live-without-tags | error | add tags, or use `'request'` | A |
| HZ051 | unmapped-head-error | error | snippet of choices per error; no patch at check time | D |
| HZ052 | unserved-route | error | patch: move links to the endpoint (schema / redirect outputs only) | D |
| HZ053 | html-from-endpoint | runtime error | make it a `ui.page` with `head.failed` | D |
| HZ054 | single-value-form-read | error | patch: `formAll` | C |
| HZ055 | unknown-form-field | error | did-you-mean | C |
| HZ056 | submit-button-click | warning | read `ui.dom.form('action')` in submit, or `type: 'button'` | C |
| HZ057 | lock-out-of-date | error | `hozu check --update-lock`, then list the accepted lines | G |
| HZ058 | contract-without-decision | warning | names the reviewing lock entry; no patch | G |
| HZ059 | reference-escape | error | make the helper a `part()`; for globals, an operator or a `fn` | H |
| HZ060 | locale-path-collision | error | rename the route | F |
| HZ061 | constrained-form-payload | warning | move limits to the mutation input | C |
| HZ062 | get-endpoint-invalidates | warning | use POST, or keep with intent | A |
| HZ063 | unknown-form-field-opaque | warning | as HZ055 | C |
| HZ064 | duplicate-contract | error | remove one (patch) | G |

- **Existing codes that change:**
  - HZ006 (parts; endpoint links);
  - HZ014 (messages; string `form`);
  - HZ015;
  - HZ018 (narrowed, fields first);
  - HZ020 (cause text: identity for per-request user data, not a cache partition; ADR 0005 D2);
  - HZ021 (at check, structured);
  - HZ032 (action, formaction, `%concat`);
  - HZ033 (submit buttons; form-safe fixes);
  - HZ036 (`formAll` and the submitter);
  - HZ037 and HZ046 (every locale's table; POST form actions);
  - HZ042 (text);
  - HZ045 (error, structural).
- **Every new code needs** a registry entry, a rule, a fix and a mistake-catalog case. The IR-mutation harness covers
  validator rules only (about half of the 48 codes today), so wave 1 adds a second harness for transform, runtime, lock and
  contract codes (HZ053, HZ057, HZ058, HZ059, HZ064). HZ044 gets its first fixture there.

## IR, lock and schema versions
- **`irVersion` 2:**
  - `Freshness` gains `request`;
  - `HeadIR.failed`;
  - `EndpointIR.output` becomes schema / `'redirect'` / `'response'`, and gains `errors`, `failed`, `invalidates` and
    `input: 'raw'`;
  - `exports.endpoints`;
  - `ValueExpr` gains `{ endpoint, input }`;
  - `removeWhere.key` becomes `string | null`;
  - `%includes`;
  - formRef identities.
  - The dom path `['formAll', name]` needs no schema change but requires the version bump: a 0.7 client reads it as
    null (`dom.ts:68-71`).
- **Lock `version: 2`** (G), including the `pages` section (D).
- **Schemas:** `pnpm schema` regenerates the JSON Schemas. The CLI's `lock` field becomes
  `'missing' | 'current' | 'stale' | 'updated' | 'skipped'`, where `'missing'` means only "no machine".

## Migration: `hozu migrate 0.8`
- **Order:**
  1. Check on 0.7: compute the v1 lock with the app's installed 0.7 packages and list the stale entries (G).
  2. Rewrite.
  3. Upgrade the dependencies.
  4. Run `hozu check`.
- **Rewrites** of source, `package.json` scripts, the skill and the `CLAUDE.md` block:
  - `op.*` → TS;
  - a motion-less `ui.if` → `?:` / `&&`, with arrays kept for several nodes;
  - `head.redirects` → `head.failed`, filling `404` and printing suspicious names;
  - user-scoped `static`, `{ revalidate }` and `{ swr }` → `'request'`;
  - `ui.link(r, p, null)`, `{}` and literals equal to the defaults → `ui.link(r, p)`;
  - the string `form` attribute → a formRef;
  - `serve.ts` + `createResolvers()` → the app module and `project({ app })`;
  - `scripts.start` → `hozu serve`;
  - plain helpers that receive references → parts;
  - the scaffold's create-on-read `itemsOf` → `listOf` + `ownListOf`;
  - the skill and the `CLAUDE.md` block (K).
- **IR equivalence:**
  - Each rewrite is tested against the committed 0.7 IR snapshot through one `normalize07` mapping (head redirects to
    `failed` with 404 filled, user freshness to `request`, link folding, and/or flattening, the `%cond`
    normalisation, string `form` to formRef). The allowed differences are listed per rewrite.
  - Value-position `op.and` / `op.or` have no TS spelling with the same IR. `hozu migrate` lists them, and they are
    reviewed through the lock (HZ057), never implicitly.
  - A helper that becomes a part and changes the IR (a D2 site) is printed as a behaviour change.
- **Never:** migrate never writes the lock and never deletes a contract.
- **What it cannot rewrite:**
  - `hozu check` points at some of it: HZ045 (a non-`app` export), HZ052 (ghost routes), and HZ053 at runtime (HTML
    from endpoints).
  - The rest it prints, because check cannot see it: hand-made i18n and query resolvers that write.
- **Behaviour changes with no diagnostic (release notes):**
  - the Accept-Language negotiation is gone, and prefixed default-locale URLs 308;
  - with G2 = server-side store, everyone signs in once more after the upgrade;
  - `ui.dom.form` is first-wins on the client, and JS payloads now include the submitter;
  - an invalid native post answers 400;
  - user data is no longer cached (budget P9 moves);
  - soft navigation is removed: every internal link loads a document.
- **The repository migrates with it:** the examples, the skill `example/`, the scaffold, `create-hozu`, the trial
  reference apps and the benches.

## Release
- **No separate 0.7.1 (gate G10: folded into 0.8.0).** 0.7.0 keeps the `/\` open redirect and the unscoped SSE
  broadcast until 0.8.0 is published. The owner accepted this exposure.
- **Wave 0 (coordinator), before any worker:**
  - on the integration branch `v0.8` (from `trial-0020`; `main` is untouched until the owner merges);
  - commit every repro to `bench/trial/longrun/repro/` as `it.fails` against the 0.7 API, where the 0.7 API can
    express it;
  - commit the 0.7 IR and v1 lock of every example, the site, the reference apps and both `s12` fixtures, computed
    with the 0.7 packages;
  - fix `anatomy.mjs`, `metrics.mjs` and `accept.mjs` (v2), and rescore trial 0020 as the baseline;
  - have the held-out changes 21–28 written by an author who does not see 0.8, and commit their SHA-256 (ADR 0044).
  - Every 0.8 worker branches from `v0.8` and first checks `git merge-base --is-ancestor <wave-0 commit> HEAD`.
- **0.8.0 waves:** each wave is a phase. The owner approved running them back to back; each ends with `pnpm gate` once
  and a report. A principle conflict, a gate that cannot be made green or a budget overrun stops the run. Workers are
  dispatched through Orca, one worktree each.
  1. **Contracts, one worker, one commit:**
     - `ProjectIR` v2 including formRef and the head and endpoint tables;
     - lock v2 including `pages`;
     - every changed output type in `packages/cli/src/contract.ts`;
     - the builder signatures in `packages/core/src/builders/{ui,page,endpoint,effects,feature}.ts` and
       `core/src/index.ts`;
     - the runtime protocol types;
     - `codes.ts` with HZ049–HZ064;
     - the second catalog harness.
  2. **Server, one worker, in order:** I (the removal), then A + B, then F, then D + E, then C.
  3. **Authoring and review:** H together with migrate's `op.*` / `ui.if` / part rewrites, run on the repository in the
     same wave. Then G, including the `pages` lock section.
  4. **The rest:** J, K, migrate's remaining rewrites, the examples, and the ADR supersession notes (listed in the
     principles table, plus the errata to ADR 0039's `a.length` row and ADR 0037 D6's `ctx.redirect`).
- **Single-writer rule:** after wave 1, one worker at a time touches `packages/core/src/ir/*`,
  `packages/core/src/builders/ui.ts`, `packages/core/src/build/scope.ts`, `packages/cli/src/contract.ts` and
  `packages/*/schema/*`. Within a wave, one worker owns `runtime-server/src/handler.ts` and
  `runtime-client/src/hydrate.ts`. In wave 3, H merges before G starts.
- **No wave removes public surface** unless the same wave migrates the whole repository (examples, site, skill,
  scaffold, reference apps, benches) and keeps `pnpm gate` green. The `hozu migrate 0.8` rewrite for it may land later
  (wave 4); it is proven against the committed 0.7 snapshots, not against the already-migrated repository.
- **Each fix flips its repro** from `it.fails` to `it`. Repros that need the 0.8 API are written by the fixing worker,
  who shows them failing on the wave-0 commit.
- **Budget P7** (8 192 B, 7 834 measured, 358 B headroom) is allocated before wave 2 (proposed shares):

| Share | Bytes |
|---|---|
| `dom.ts` formAll + submitter | ≤ 120 |
| machine `removeWhere(null)` | ≤ 40 |
| the effect barrier (B) | ≤ 150 |
| reserve | ≥ 48 |

  - `%includes` lives in `fns.js`. The bytes freed by I join the reserve.
  - A wave that exceeds its share stops and raises it.
- **Examples:** `examples/notes` gains the 403 admin page, the bulk form (formAll + formRef) and German under (c), as
  the runnable example the workflow rules require.

## Measure (trial 0021; registered in ADR 0044 before wave 1)
- **Tools first:**
  - `anatomy.mjs`, `metrics.mjs` and `accept.mjs` v2 rescore all 84 trial-0020 snapshots as the new baseline, after
    the 0.8 CLI surface is frozen.
  - The verify category includes `hozu browse` and CDP probes.
  - HZ018 is counted from diagnostics only: per run, 12 blocking in steps 1–20 (11 with identical was/now) and 6 in
    steps 13–20 (all identical).
  - The lock metrics are new copy-only entries never committed (0.7: 12 / 4) and behaviour changed without a contract
    change.
  - Silent failures are counted as introductions (0.7: 2 / 1), reviewed by hand; the automatic heuristic is not a
    gate.
  - Acceptance additions: B3 with two values without JS, G2 checks the list with JS, DA1 without JS as a control, and
    a no-JS/JS parity check (N16, which excludes the documented 400 of C).
- **Primary variant:**
  - `s12m` = `hozu migrate 0.8` on both runs' `s12`, the owner's written review of each stale v1 entry, then
    `hozu check --update-lock`; commit and tag.
  - The start criterion is 0 errors. The HZ058 list is recorded as the `s12m` baseline, not required to be empty.
  - Steps 13 → 20, then the held-out 21 → 28.
  - Nuxt re-runs from its own `s12` at the same time, as a drift control.
  - Three runs per framework, fixed in advance; the third starts from run 1's `s12m`.
  - Every run records the SHA-256 of the managed instructions, `~/.claude/CLAUDE.md`, the app's `CLAUDE.md` and the
    skill, all frozen for the trial.
- **Held-out changes 21–28:**
  - written, with their acceptance checks in a separate file that `accept.mjs` loads, by an author who does not see
    0.8;
  - the research drafts of 21–28 are discarded;
  - the SHA-256 of both files is committed before the 0.8 tarballs are frozen;
  - they are validated on both reference apps.
- **Short variant:** a create-hozu 0.8 scaffold, steps 0–7, which measures K and G on a fresh app.
- **Pre-registered targets:**
  - no regression and no silent introduction in steps 13–28;
  - the geometric-mean cost ratio Hozu / Nuxt over 13–20 at most 1.8×. For 0.7 it is 2.64× / 2.73× (pooled 2.68×; the
    ratio of totals is 3.06× / 3.85×), and over steps 1–12 it is 1.68× / 1.79×, so 1.8× is about 0.7's level before
    the defects.
  - step 13 at most 2× Nuxt (0.7: 8.9×);
  - the defect-free step 14 at most 1.25× (0.7: 1.59×);
  - step 19, whose 401 endpoint D changes, at most 1.4× (0.7: 2.19×);
  - step 18 at most 1.3× its neighbours' mean (0.7: 2.65× / 2.06×);
  - the D7 detour on step 16 removed.
  - ADR 0042's thesis is re-tested on 13–28 with the log-ratio slope.
  - Mutation tests (1–2 planted defects each for D3, D4, D7 and D9): 0.7's `hozu check` is expected to catch 0
    (confirmed when the mutations are written), and 0.8's check or browse should catch every one.
  - DA1 passing proves D9a only; D9b, D9c and D4f are proven by their repro tests.

## Decisions for the owner (all decided 2026-09-30: as recommended, except G4 and G10 as noted)
| Gate | Question | Recommendation | Main trade-off |
|---|---|---|---|
| G1 | Change principle 8: user data is never cached across requests (`'request'` / `'live'` only), and `'request'` is a per-request region in any scope | yes | cost per request vs. correctness by construction; budget P9 moves |
| G2 | Sessions: a server-side store with an opaque id (default `memorySessions()`), or a stateless token + id/exp + revocation list | **server-side store** | fails closed on restart (everyone signs in again) and hides the payload, vs. no lookup; both are per instance, and edge or multi-instance needs a shared store (an external service to approve) |
| G3 | i18n: the default locale unprefixed, URL-only (overturns ADR 0017 A1, chosen by you in phase 7c) | yes, no cookie in 0.8; decided after step 18 runs on the reference | shareable URLs and cache-safe rendering vs. no remembered preference on unprefixed URLs |
| G4 | Soft navigation: fix and narrow, or remove (ADR 0015) | **decided: remove** | an invisible derived behaviour no trial needed, and the cause of D10 and DA1's JS path; the cart panel no longer keeps machine state across links |
| G5 | The lock must equal the computed lock (HZ057 error, explicit `--update-lock`), or `hozu check` writes it with a frozen gate | **error + explicit** | either way the real review is you reading the lock diff (agents accepted by reflex, 15 / 11 times); the choice is principle 2 (no unasked file writes) vs. about 3 extra calls per run over steps 13–20 |
| G6 | `ui.link` search optional (overturns ADR 0014 §1) | yes | fixes D1 at the source; "omitted = defaults" follows ADR 0022 |
| G7 | Remove `op.*` and the motion-less `ui.if` in 0.8, or deprecate until 0.9 | **remove**, since this is the breaking release, on the condition that `Child[]` branches and the migrate rewrite land in the same wave | principle 1 now vs. a larger codemod; agents wrote neither in 42 sessions, while the examples use them heavily |
| G8 | `hozu post` replaced by `hozu browse --js off` | yes | one step language vs. a familiar command; the gap (per-item targets) is closed by `in "<text>"` |
| G9 | Scenarios (`scenario()` + `hozu verify`) in 0.8 | **no, defer** | would catch DA1-class failures, but a third behaviour form, text selectors (principle 3) and cross-feature ownership (principle 6) are unresolved |
| G10 | Publish 0.7.1 first | **decided: no, folded into 0.8.0** | 0.7.0 keeps the open redirect and the SSE broadcast until 0.8.0 ships |
| G11 | `part()` (a principle 4 amendment), or HZ059 alone with "inline or split a view" | **part()** | one declared reuse form vs. no new concept; D2 was met once (the reference), 0 times in agent code |
| G12 | Trial 0021 budget: 3 runs × 2 frameworks, held-out + short variant (≈ 18 M weighted tokens required, 25 M ceiling) | approve with ADR 0044, before wave 1 | statistical power vs. quota |

## Contract layer (wave 1)
Types only: nothing below is emitted by a builder yet, so every 0.7 program builds to the same IR apart from
`irVersion` and `exports.endpoints`. Later waves build on these names and do not invent their own.

**IR v2** (`packages/core/src/ir/types.ts`, schema `packages/core/schema/project-ir.schema.json`):

| Type | Where | Change |
|---|---|---|
| `ProjectIR.irVersion` | `types.ts:6`, emitted at `core/src/build/project.ts:434` | `2` |
| `HeadIR.failed?` | `types.ts:62` | `Record<string, HeadFailureIR>`, next to `redirects` (wave 2 removes `redirects`) |
| `HeadFailureIR` | `types.ts:65` | `{ redirect: string } \| { status: 403 \| 404 \| 410 }`; `redirect` holds a route id |
| `EndpointIR.mode?` | `types.ts:103` | `EndpointMode`; `output` keeps its meaning (wave 2 makes `mode` required) |
| `EndpointIR.raw?` | `types.ts:104` | `true` = `input: 'raw'` (the resolver reads `ctx.bytes`) |
| `EndpointIR.errors?` | `types.ts:105` | name → schema ref, as in mutations |
| `EndpointIR.failed?` | `types.ts:106` | name → `EndpointStatus` |
| `EndpointIR.invalidates?` | `types.ts:107` | `TagExprIR[]` |
| `EndpointMode` | `types.ts:110` | `'json' \| 'redirect' \| 'response'` |
| `EndpointStatus` | `types.ts:112` | `400 \| 401 \| 403 \| 404 \| 409 \| 410 \| 422 \| 429` |
| `ExportsIR.endpoints` | `types.ts:135` | `string[]`, always `[]` in wave 1 (`core/src/build/feature.ts:31`, `core/src/build/project.ts:86`, `core/src/builders/feature.ts:42`); exporting an endpoint stays HZ014 until wave 2 |
| `Freshness` `{ kind: 'request' }` | `types.ts:153` | the builder still rejects `'request'` (HZ014); the compiler maps it to mode `request` (`compiler/src/plan.ts:56`), the data runtime reads it uncached (`data/src/runtime.ts:368`) |
| `ValueExpr` `{ endpoint, input }` | `types.ts:237` | `input: ValueExpr \| null`; `anyRef` walks it (`core/src/ir/refs.ts:14`) |
| `FormRefIR` | `types.ts:240`, in `ValueExpr` at `types.ts:238` | `{ formRef: string }`: the value of a control's `form` attribute |
| `ElementNode.ref?` | `types.ts:292` | `FormRefIR` on a `<form>` node |
| `AssignOp` `removeWhere.key` | `types.ts:246` | `string \| null`; null = compare the element itself |
| `operators`, `Operator`, `unimplementedOperators` | `core/src/ir/operators.ts:1,12,14`, exported from `@hozu/core/ir` (`core/src/ir.ts:25`) | the builtin list, with `%includes` declared and not implemented; `operatorFns` is typed against it (`core/src/builders/operators.ts:6`) |

- **Not supported until wave 2, reported as HZ014:**
  - `removeWhere` with `key: null`: validator `validator/src/rules/paths.ts:121`; `compileMachine` throws
    `CompileError('HZ014')` (`machine/src/compile.ts:122`). That throw costs 24 B of budget P7 (7 834 → 7 858), taken
    from the `removeWhere(null)` share; wave 2 replaces it with the implementation.
  - `%includes`: validator `validator/src/rules/refs.ts:36`.
  - `endpoint` / `formRef` values: the render generator throws (`runtime-server/src/generate.ts:138`).
    `compileMachine` only narrows the type (`machine/src/compile.ts:46`), to keep P7 unchanged; no validator rule
    reports these values yet. Display only: `cli/src/render.ts:15`, `validator/src/contracts/mechanical.ts:58`.

**Lock v2** (`packages/validator/src/contracts/record.ts`, exported from `@hozu/validator`; the validator still
reads and writes v1):

| Type | Where | Shape |
|---|---|---|
| `EnteredRecord` | `record.ts:10` | `{ state, effect, input, timers, final }` of the entered state |
| `BehaviorRecord` | `record.ts:18` | `{ guard, assign, navigate, enters, fns }`: the previous record G's acceptance runs contracts against; `fns` = ref → `sourceHash` |
| `LockEntryV2` | `record.ts:26` | `{ behavior, summary, decides, fields: BehaviorRecord, contracts }` |
| `EndpointLockV2` | `record.ts:34` | `{ mode, failed }` |
| `PagesLockV2` | `record.ts:39` | `{ head: page → error → HeadFailureIR, endpoints: feature.endpoint → EndpointLockV2, redirects: from → { to, permanent } }` (D) |
| `LockfileV2` | `record.ts:45` | `{ version: 2, features, pages }` |

**CLI output** (`packages/cli/src/contract.ts`, schemas regenerated under `packages/cli/schema/`):

| Type | Where | Change |
|---|---|---|
| `LockState` | `contract.ts:15` | `'missing' \| 'checked' \| 'current' \| 'stale' \| 'updated' \| 'skipped'` (`'checked'` leaves in wave 3); `ValidateOutput.lock` at `contract.ts:22` |
| `BrowseMode` | `contract.ts:232` | `'on' \| 'off'` (`--js`) |
| `BrowseError.url?` / `type?` / `actor?` / `mode?` | `contract.ts:238-241` | J's error fields |
| `BrowseOutput.actors?` | `contract.ts:273` | `BrowseActor[]`, one per `--as` |
| `BrowseActor` | `contract.ts:276` | `{ name, url, status, title, steps, errors, text }` |

**Runtime protocol:** `EffectResponse.session?: true` (`runtime-client/src/hydrate.ts:51`, imported by
`runtime-server/src/handler.ts`). Type only; the P7 bundle is unchanged.

**Second mistake-catalog harness:** `packages/validator/test/source-mistakes.test.ts` for codes that are not IR rules.
- A case is `{ name, code, stage: 'transform' | 'runtime' | 'lock' | 'contract', mistake, fixed }` (`:7`, `:9`);
  `mistake` and `fixed` return the diagnostics of a source program.
- Each case asserts that the code is reported with its registry severity, a pointer and a fix with a patch or a
  snippet, and that `fixed` no longer reports it.
- The catalog (`:45`) has one case, HZ047. Later waves add HZ044, HZ053, HZ057, HZ058, HZ059 and HZ064 there.

**Not in wave 1** (the task limited it to the items above): the diagnostic registry entries HZ049–HZ064
(`core/src/ir/codes.ts`, `diagnostic.ts`) and the builder signatures in `core/src/builders/*`. They are still to be
done, before or with the first rule that emits them.
