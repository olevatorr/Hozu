# ADR 0049 — 0.11: where queries and mutations run, and `hozu migrate`

- **Status:** accepted (owner, 2026-10-02).
  - 0.11 is `hozu migrate` (first) and this design.
  - The scale work, `hozu call` and the DevTools API panel move to 0.12.
- **Problem:** every query and mutation runs on a Hozu server, and the client reaches them through `/_hozu/query` and
  `/_hozu/effect`. That is wrong or impossible for ordinary apps.
  - **A pure front end on a static host** (GitHub Pages):
    - `exportStatic` skips every page with per-request data;
    - nothing answers a mutation or a client-side read.
  - **Data behind another service.**
    - Every client-side read is proxied: browser → Hozu → API, even when the API allows the browser (CORS).
    - The app pays the egress and the hop twice, though nothing on its server was needed.
  - **A token that lives in the browser** (OIDC / SSO single-page apps, a personal token):
    - it would have to travel to the app's server;
    - an API that trusts the user's own cookies, or binds by IP or device, cannot be proxied at all.
  - **The only escape is a client component that calls `fetch` and emits events,** which drops the schema, the
    declared errors, the tags and the states.
- **What Hozu needs is not a server.** It needs data access to be *declared*: input, output, errors and tags. What
  an implementation **needs** (server secrets, browser credentials, or neither) is one more declared fact. Where it
  runs on a given deployment is derived from that fact (principle 8).

## Decision

### 1. `runs`: what an implementation needs
```ts
export const searchRepos = query({ input: Q, output: Repos, scope: 'public', freshness: 'request' })  // runs: 'either' (default)
export const myRepos = query({ input: P, output: Repos, scope: 'user', freshness: 'request', runs: 'browser' })
export const listOrders = query({ input: P, output: Orders, scope: 'user', freshness: 'request', runs: 'server' })
```
| `runs` | The implementation needs | Example |
|---|---|---|
| `'server'` | server secrets, a database, the server session | an SQL query; a third-party API with the app's API key |
| `'browser'` | the visitor's browser credentials | a token in `localStorage` / an OIDC library; an API that trusts the user's cookies |
| `'either'` (**default**) | neither: plain `fetch` against an API the browser may call | a public API; your own API with CORS |

- **The default is `'either'`,** like `useFetch`: an implementation that needs nothing special runs where it is
  cheapest.
  - This is a deliberate exception to ADR 0022, under which behaviour-deciding fields stay required. The owner chose
    it.
  - Existing code is not affected: the 0.10 → 0.11 migration marks every existing query and mutation
    `runs: 'server'` (see 6).
- **The rule for agents** goes in one line of `SKILL.md`: secrets or a database → `'server'`; the visitor's own
  credentials → `'browser'`; everything else → leave the default.
- **Combinations:**
  - `'either'` requires `scope: 'public'`. Per-visitor data needs the server session (`'server'`) or browser
    credentials (`'browser'`).
  - `'browser'` takes either scope.

### 2. Where implementations live
- **`runs: 'server'`:** resolvers in `app.ts` or `features/<name>/server.ts`, exactly as in 0.10.
- **`runs: 'either'` and `'browser'`:** `features/<name>/fetch.ts`, named by the feature, with one export per effect
  under the effect's name:
```ts
// feature.ts
export const repos = feature({ id: 'repos', intent, declarations: [model, views],
  fetch: new URL('./fetch.ts', import.meta.url) })

// fetch.ts: type-only import of the model; runs in the browser, and on the server for 'either'
import { implement } from '@hozu/core/fetch'
import type * as model from './model.ts'
export const searchRepos = implement<typeof model.searchRepos>(async ({ q }, { fail, signal, env }) => {
  const r = await fetch(`${env.API_URL}/search/repositories?q=${encodeURIComponent(q)}`, { signal })
  return r.ok ? r.json() : fail('Unavailable', {})
})
export const myRepos = implement<typeof model.myRepos>(async ({ page }, { fail, signal }) => {
  const token = localStorage.getItem('gh-token')
  if (!token) return fail('Unauthorized', {})
  const r = await fetch(`https://api.github.com/user/repos?page=${page}`,
    { headers: { authorization: `Bearer ${token}` }, signal })
  return r.status === 401 ? fail('Unauthorized', {}) : r.json()
})
```
- **The binding is by export name,** the same rule as `declarations: [model, views]` (ADR 0041 C). `typeof` keeps
  the input, output and errors typed. Nothing of the model is shipped: the import is type-only.
- **The context:**
  - `fail` (a declared error);
  - `signal` (aborts when the input changes or the page leaves);
  - `env` (the parsed `public` environment).
  The session and server secrets are not in it.
- **One bundle per feature,** loaded on demand by the pages that use it.
  - The server imports the same module for `'either'` effects.
  - It must be isomorphic: a Node-only import (`node:fs`, a database driver) fails the browser bundle, and the bundle
    reports it as HZ081 with the effect and the import.

### 3. What runs where (derived)
| | Deployed with a server (node, edge) | Static host (no server) |
|---|---|---|
| `'server'` | First paint: SSR. Later reads in the page: `/_hozu/query`. Mutations: `/_hozu/effect` | Pages are written with the data read at export (public, cacheable only). A runtime read or mutation is reported by `exportStatic` (HZ082) |
| `'either'` | First paint: **SSR** (data in the HTML, cached per `freshness`). Later reads in the page: **the browser calls the API directly** (no `/_hozu/query`). Mutations: in the browser | First paint: written at export when `freshness` is cacheable, otherwise `pending`. Later reads and mutations: in the browser |
| `'browser'` | First paint: the server renders `pending`; the browser reads after hydration. Never cached on the server | The same |

- **Rendering:** a `'browser'` query is the region mode `browser` (principle 8's client mode).
  - Its node hydrates as an island, with or without a machine.
  - It does not make the page uncacheable, because the server never sees its data.
- **Freshness describes the data, not the place.**
  - `'request'` means "read every time it is needed": on the server per request, in the browser on mount and on
    tags.
  - Server caching applies only where the server reads.
  - The guide stops presenting `'static'` as the default for public data; the agent chooses by how the data
    changes.
- **No-JS forms:**
  - a native post runs an `'either'` or `'server'` mutation on the server, when there is one;
  - a `'browser'` mutation, or any mutation on a static host, makes the form need JS (HZ036 warns).

### 4. Data, checks and tags in the browser
- **Results** go into the page store, keyed by query and input, like server results.
- **Inputs and outputs** are checked against the IR's JSON Schemas by a small checker in a lazy `fetch.js` chunk. No
  zod is shipped.
  - A wrong output is `Unexpected` with the schema path.
  - A thrown error or a rejected `fetch` is `Unexpected`.
- **Tags:**
  - A mutation that runs in the browser re-reads the browser-run queries on the page with its tags.
  - A server mutation's response now lists its invalidated tags (`EffectResponse.tags`), so browser-run queries
    re-read too.
  - **HZ082:** a mutation that runs in the browser may not name a tag that a server-cached query reads. The server
    would never hear of it.
- **Taint:** data read with browser credentials counts as per-visitor. A public server query keyed by it is HZ022.

### 5. Rules
- **HZ081 `invalid-effect-runtime`** (error), reported when:
  - an `'either'` effect has a scope that is not `'public'`;
  - an `'either'` / `'browser'` effect has no export of its name in the feature's `fetch.ts`, or the feature has no
    `fetch`;
  - an export in `fetch.ts` names no such effect;
  - a `'server'` effect is implemented in `fetch.ts`, or an `'either'` / `'browser'` one in the server resolvers;
  - `fetch.ts` does not bundle for the browser (a Node-only import).
- **HZ082 `effect-needs-server`** (error), reported when:
  - a `'browser'` query feeds a page `head`, page `entries` or an endpoint;
  - a mutation that runs in the browser names a tag that a server-cached query reads;
  - `exportStatic` finds a written page that can call a `'server'` effect at runtime.
- **HZ036** is extended to forms that need JS (section 3).

### 6. `hozu migrate`, from 0.10.0 onward (phase 0)
- **It reverses ADR 0045 L** (2026-10-01: no migration support until the first stable release); the owner reverses
  that decision.
- **Policy:**
  - every release from 0.11 ships a step from the release before it;
  - `hozu migrate` reads the installed version and chains the steps up to the CLI's version;
  - 0.10.0 is the oldest starting point. Anything older is told so and stopped.
- **Order, as in ADR 0043:**
  1. Check on the old version and save its IR (`.hozu/migrate-<from>.json`).
  2. Rewrite the source.
  3. Upgrade the `@hozu/*` and `create-hozu` dependencies, the skill and the `CLAUDE.md` / `AGENTS.md` block.
  4. Run `hozu check`.
  5. Compare the new IR with the saved one through the step's declared normalisation, and print every difference
     that is not declared.
  6. Print what it cannot rewrite.
- **Never:**
  - it never writes the lock;
  - it never deletes a contract;
  - behaviour changes are reviewed through HZ018 as usual.
- **Flags:** `--dry-run` prints the plan and the diffs without writing; `--json` follows the CLI contract
  (`MigrateOutput`, with a schema).
- **The 0.10 → 0.11 step:**
  - adds `runs: 'server'` to every `query(...)` and `mutation(...)` that has none, in the file's own style, so
    behaviour is unchanged under the new default;
  - upgrades the dependencies and the guide;
  - normalises the IR comparison: `runs` is `'server'` everywhere, and `fetch` is null on every feature.
- **Tests:** a copy of each example at the 0.10.0 tag is migrated, then checked and tested. A step whose comparison
  finds an undeclared difference fails.

## Principle check
- **Principle 4:** side effects still go only through declared queries and mutations, with checked input, output and
  errors.
- **Principle 8:** where an effect runs is derived from what it needs and from the deployment.
- **Principle 9:** server-read data is still serialized and never refetched; an `'either'` re-read in the page is a
  new input, as `/_hozu/query` was.
- **Out of scope, "Pure SPA mode as a separate concept":** this is a per-effect property, not a mode. The owner
  accepted the change of premise ("every effect runs on the server").
- **ADR 0022 (behaviour-deciding fields are required):** `runs` is the owner's exception, defaulting to `'either'`.
- **Zero dependencies:** kept. The JSON Schema checker is Hozu's own and covers the subset the IR emits.

## Options considered
1. **Status quo (proxy everything).** Rejected: it doubles traffic for API-backed data, and is impossible on a
   static host.
2. **`'server'` or `'browser'` per effect (the first draft).** Rejected: one place per effect, fixed whatever the
   deployment, so a public API is either proxied or never server-rendered.
3. **A browser module per effect** (`browser: new URL(...)` on each declaration). Rejected for the default case: one
   file per query is heavy when `'either'` is the default.
4. **What the implementation needs, with a per-feature `fetch.ts` bound by export name (chosen).**
5. **Hozu-owned client auth.** Deferred: the token sources vary, and the abstraction should follow real apps.

## Budgets
- P7 (initial JS) is unchanged.
- **New P11:** the `fetch.js` runtime chunk (runner and JSON Schema checker) ≤ 3 KB gzip, loaded only on pages with
  browser-run effects.

## Phases
0. **`hozu migrate`:**
   - the step registry;
   - 0.10 → 0.11 (`runs: 'server'`);
   - the CLI contract and schema;
   - tests against the 0.10.0 examples.
1. **Core, IR and compiler:**
   - `runs` and `feature({ fetch })`;
   - `QueryIR.runs` / `MutationIR.runs` and `FeatureIR.fetch`;
   - the `browser` region mode and islands;
   - HZ081, HZ082 and HZ036.
   Tests include the mistake-catalog cases.
2. **Server:**
   - SSR of `'either'` through `fetch.ts`, and `pending` for `'browser'`;
   - the data runtime and `resolvers()` split by `runs`;
   - `/_hozu/query` and `/_hozu/effect` answer 400 for effects the server does not run;
   - native posts;
   - `EffectResponse.tags`.
3. **Client:**
   - the lazy `fetch.js` (runner, checker);
   - routing reads and mutations by `runs`;
   - tag re-reads;
   - abort;
   - `@hozu/core/fetch`.
   Budget P11.
4. **Bundle and deploy:**
   - `@hozu/bundle` builds each feature's `fetch.ts` for the browser;
   - `createHandler` / adapter-node serve it;
   - `exportStatic` writes `'either'` data at export, copies the bundles and reports HZ082.
5. **Tools and guide:**
   - `map` / `inspect` / `impact` / `plan` / `explain` show `runs` and where it resolves;
   - DevTools Layers;
   - `SKILL.md` (the one-line rule), `hozu docs data` and `auth`, and a new `hozu docs fetch`;
   - the scaffold writes `runs: 'server'` for its own resolvers.
6. **Examples and gate:**
   - `examples/stars`: static, a `'browser'` query with a token from `localStorage`, an `'either'` public search, and
     star / unstar, with intercepted network in its tests;
   - migrated examples;
   - gate green.

## Measure
- `examples/stars` exports to a static directory and works against intercepted GitHub responses. Its pages never
  request `/_hozu/query` or `/_hozu/effect`.
- On a server deployment, an `'either'` page's first paint has the data in the HTML, and a later in-page read goes to
  the API, not to the server.
- Every 0.10.0 example migrates, checks and passes its tests.
- P7 is unchanged, and P11 ≤ 3 KB.
