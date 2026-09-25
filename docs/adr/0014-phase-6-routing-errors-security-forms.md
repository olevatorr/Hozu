# ADR 0014 — Phase 6: search params, typed navigation, error pages, security baseline, progressive forms

- Status: accepted (Tier 1 of ADR 0011; the user approved continuing after trial 0005)
- Scope: the five Tier 1 gaps, plus one defect found while designing them: `navigate` on a transition never
  navigated in the browser. The runtime dispatched a `tenon:navigate` DOM event that nothing listened to, so the
  cart's checkout never reached `/order/placed`.

## 1. Search params
| Option | Trade-off |
|---|---|
| a. Merge the query string into `params` | Hides where a value comes from; path and query have different rules (a path param is required, a query param is optional) |
| **b. `route({ path, params, search })`** | One more field. Explicit, and it matches how URLs work |

**Decision (b).**
- `search` is `schema | null`.
- The schema must be a flat object whose fields are string, number, integer, boolean or enum, each with a
  default or nullable. Otherwise **TN035** (invalid-search-schema) is reported.
- The server parses the query string field by field (numbers and booleans are coerced). An invalid or missing
  value falls back to the default, so a URL never 500s because of its query string.
- Views receive `{ params, search }`, with a new reference source `search`. It can feed query inputs, head and
  text like any other reference.
- Writing: `ui.link(route, params, search)`. The third argument is required when the route declares `search`;
  `null` means "all defaults". Keys equal to their defaults are left out of the URL, so every URL has one
  canonical form (principle 1).
- Rendering stays derived:
  - A page whose views read `search` is cached per canonical URL, including the sorted query string.
  - Unknown query keys are ignored and do not multiply cache entries.
- Changing `search` is a navigation. Updating the URL without a reload (shallow routing) comes with soft
  navigation (ADR 0011 Tier 2, item 6).

## 2. Typed navigation
| Option | Trade-off |
|---|---|
| a. `navigate: route` plus a separate `navigateParams` | Two fields for one concept |
| **b. `navigate: ui.link(route, params, search)`** | One concept, a typed URL, used for both `href` and navigation |

**Decision (b).**
- `navigate` takes a link expression evaluated against the transition's event, result or error and the
  context. So "create, then open the new item" is `navigate: ui.link(itemPage, { id: r.id }, null)`.
- The IR stores it as a `ValueExpr` that must be a link (TN007 for unknown routes, TN031 for literal params).
- The machine emits `{ type: 'navigate', url }`. The client runtime calls `location.assign(url)`, which fixes the
  defect.
- Contracts can now see navigation: `expect.effects` lists `{ navigate: '/order/placed' }` next to invoked
  effects, so principle 5 covers where a transition sends the user.
- The cart example's checkout contract is updated to specify its navigation.

## 3. Error page and error hook
- `project({ error: route | null })`: a static page rendered with HTTP 500 when rendering fails before the first
  byte. Without it, a minimal built-in HTML page with `noindex` replaces today's plain text.
- A head query that fails with `Unexpected` keeps rendering the page itself, with its own `Unexpected` branches
  and HTTP 500. The page knows best what to show.
- `createServer({ onError(error, { path, effect }) })` is called once for every unexpected failure:
  - a resolver throwing (the data layer still turns it into `Unexpected` for the view);
  - a render crash;
  - an effect request that fails.

  This is where logging and error reporting plug in. The default writes to `console.error`.

## 4. Security baseline (adapter-node, on by default)
- **CSRF**: `POST /_tenon/*` and progressive form posts are rejected with 403 when the browser says the request
  is cross-site. That is the case when `Sec-Fetch-Site: cross-site` is present, or when the `Origin` header
  differs from the request's origin. Requests without these headers (curl, server-to-server) pass. Session
  cookies stay `SameSite=Lax`.
- **CSP**:
  - `default-src 'self'; script-src 'self' <hashes>; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`
    `frame-ancestors 'self'; base-uri 'self'; form-action 'self'`.
  - Inline executable scripts (speculation rules) are allowed by their sha256 hash, not by a nonce, so cached
    ISR pages stay valid.
  - `style-src 'unsafe-inline'` is needed for `vars` (inline custom properties).
  - JSON data blocks are not executed and need no hash.
  - `createServer({ csp })` may add sources (e.g. an analytics host) or be `false`.
- **Headers**: `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.

## 5. Progressive forms
| Option | Trade-off |
|---|---|
| a. A separate "form action" concept | A second way to run a mutation (against principle 1) |
| **b. Run the same machine on the server for a native form post** | No new authoring concept; the behaviour is the machine the contracts already specify |

**Decision (b).**
- **Rendering**: every `form` with an `on.submit` send renders as `<form method="post">` with a hidden
  `__tenon` field naming the form node.
- **With JavaScript**: the runtime intercepts the submit as today, so nothing changes.
- **Without JavaScript**: the browser posts the form to the page URL, and the server:
  1. finds the form node and its event, and builds the payload. Only `ui.dom.form(name)` values, literals and
     initial-context references are allowed; anything else is reported by **TN036**
     (form-not-server-runnable) as a warning, and that form then needs JS;
  2. runs the page's machine from its initial state: the event, then any `invoke` chain through the resolvers,
     until it reaches a state without an `invoke`;
  3. if a transition navigates, answers **303** to that URL;
  4. otherwise, if the machine is back in its initial state with its initial context, answers **303** back to the
     page (post/redirect/get), so a reload does not resubmit;
  5. otherwise renders the page with that machine snapshot (for example, showing the duplicate-title
     `role="alert"`). The status is 200 for declared errors and 500 for `Unexpected`.
- The same CSRF check applies. Buttons outside forms (per-item actions) still need JS; wrapping them in a form is
  the no-JS pattern.

## Diagnostics
| Code | Name | Severity |
|---|---|---|
| TN035 | invalid-search-schema | error |
| TN036 | form-not-server-runnable | warning |

Each gets a registry entry, a rule, a fix and a mistake-catalog case.

## Consequences
- `navigate` changes from a route reference to a link expression. The cart example is migrated, and the IR
  schema is regenerated.
- The skill (`SKILL.md`, `changing.md`, `patterns.md`) and `examples/bookmarks` are updated. Bookmarks gains a
  search param (`?show=unread`) and a detail link after creating a bookmark.
- **P7 budget: 7 KiB → 7.5 KiB.** Typed navigation and canonical search strings must run in the client, because
  islands render links and navigate after mutations. They add 185 B (7,155 → 7,340 B gzipped) after the query
  builder was minimised. The new budget leaves about 340 B of headroom. The initial client is still several
  times smaller than the frameworks compared in docs/benchmarks/0001.
- **A4 budget: 50,000 → 55,000 type instantiations** for `examples/cart`. The new route, link, navigate and
  contract types raise it to about 51,100. Bisecting the new generics individually moved it by fewer than
  200 each, so the growth is spread across the packages' declaration files rather than one expensive type.
  TypeScript still checks the example in well under a second.
- The gate stays green and parity stays at 24 / 24.
