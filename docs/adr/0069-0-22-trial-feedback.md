# ADR 0069 — 0.22: what two agents building a CMS, a shop admin and a storefront asked for

- **Status:** accepted (owner, 2026-10-08: "不，全部都在0.22"; with ADR 0068, then both trials run again on 0.22).
- **Evidence:** two agents built, from `create-hozu@0.21.1` and the shipped guide only, a CMS + shop admin
  (`~/Developer/hozu-trial-admin`, 19 pages, staff roles, MySQL) and its storefront (`~/Developer/hozu-trial-store`,
  catalogue, checkout, shopper sign-in, the same MySQL). Each then wrote a candid review. The admin spent 20–30 % of its
  time on framework friction, the storefront about 1.5 h of 5. Both would choose Hozu again for this kind of app.

Every item below names who hit it, the decision, and why. "Docs" means the framework is right and the guide was not.

## A. Tools that wasted the most time
| # | Problem (who) | Decision |
|---|---|---|
| A1 | `hozu get` / `call` / `browse` never exit while the app holds a database pool (both) | The CLI exits when a one-shot command has printed its result; `app({ dispose })` closes what the app opened (called by `hozu serve` on SIGTERM and by the CLI before it exits). |
| A2 | A page answered 500 with nothing printed: a query input that fails its schema (a string route param into `z.number()`) returned `Unexpected` silently, and `app({ onError })` was never called (admin, 25 min) | A query input that fails its schema is a program error: the runtime calls `onError` with the issues and where the input came from. `hozu get` / `browse` list the server errors of each step. |
| A3 | "N elements rebuilt unchanged (a flash)" with no way to find them, and false positives: two empty inputs of the same class at different places, or a node that moved (both, 45 min + 30 min) | A flash is an element removed and one with the same tag, class, text, `name`, `id`, `href`, `src`, `type` and parent path added in the same step; the report names up to five (`main > form > input[name=card]`) and `--json` lists them all. |
| A4 | `hozu add feature … --with auth` wrote `accountnotesfeatures: []` into hozu.config.ts (store) | Fix the scaffold; a test runs every `--with` combination through `hozu check`. |
| A5 | `hozu docs pages` shows `--select 'meta[property^="og:"]'`, which browse refuses (store) | Attribute operators `^= $= *= ~=` in `--select`. |
| A6 | `fill Body=a\nb` types a backslash and an n (admin) | `\n` and `\t` in `fill` values. |
| A7 | `project({ routes })` from a namespace import that also exports a schema crashed with `Cannot read properties of undefined (reading 'def')` (admin) | Validate each route value: HZ014 naming the key that is not a route. |

## B. Authoring surface
| # | Problem (who) | Decision |
|---|---|---|
| B1 | A machine kept its state across pages, so the quantity chosen on one product came along to the next (store) | **0.21's C4 narrows:** a machine keeps its state only through a view that two pages share (the ones `data-hz-view` marks). The same view on another item of one route (`/products/:slug`) starts fresh, as on any framework. |
| B2 | A machine cannot start from server data: a checkout prefilled from the member wrapped the form in `ui.query(me)` four times (store) | `seed` may read one query: `seed: { query: me, input: () => ({}), map: (me, { params, search }) => ({ email: me.email }) }`. Server render, payload, no-JS posts and HZ048 treat it like an address seed. |
| B3 | A native `<dialog>` cannot be closed by the machine (admin, 20–40 min per agent) | `ui.dialog({ open: is(['editing']) })`: a dynamic `open` on `<dialog>` calls `showModal()` / `close()`; Escape sends the dialog's `close` event as usual. |
| B4 | No current page for a shared navigation; 11 `:has()` CSS rules (admin) | Every `ui.link` to the page being rendered gets `aria-current="page"` (server and client), so `aria-[current=page]:font-bold` styles the menu. |
| B5 | Every page repeats `views: [Sidebar, X]` and the staff head guard (admin) | **Docs:** pages are config, so a helper is the layout: `const staff = (route, View) => ui.page(route, { views: [Sidebar, View], head: staffHead })`. A recipe shows it. No new concept. |
| B6 | `access: { allow }` cannot be shared, the same line 20 times (admin) | **Docs:** `part()` already shares it: `const staffOnly = part(({ session }) => session.role !== 'editor')`, then `access: { allow: staffOnly }` (tested). A plain arrow is not lowered, which is what the admin hit; no new export (A3 keeps core at 16). |
| B7 | `session` stays `Session \| null` after `access: 'signedIn'` (both) | Resolvers of effects with `access: 'signedIn'` get `session: Session` (the declaration's type carries it). `{ owner }` with callbacks cannot be inferred by TypeScript and keeps `Session \| null`. |
| B8 | A resolver cannot answer `Forbidden` (both) | `fail('Forbidden', { message? })` in any server resolver of a user effect, the framework error that `failed` / `head.failed` already handle. |
| B9 | `head.input` cannot read `search`, so `/journal?topic=makers` has the same `<title>` (store) | `head.input(params, { search, locale })` for a route with `search`. |
| B10 | HZ033 refused a hidden input whose value is an enum context field (store) | A `value` that is a reference to a field whose schema is the enum is accepted. |
| B11 | `null` / `false` in a constant `.map` was "Invalid view child", although the guide says they render nothing (admin) | Lists drop `null` and `false` (and so `cond && node` in `.map`). |
| B12 | `<a rel>` was refused (admin) | `rel` on `a`, `area` and `form` (the DOM table had dropped it globally). |
| B13 | `props.x !== undefined` was "Unsupported value (undefined)" (admin) | Not reproduced (`props.x !== undefined` and `&&` build); the message for an `undefined` value now says to give the prop `.default(…)` and compare with it. |
| B14 | Counting words in views ("1 items") (admin) | `ui.format.plural(n, { one: '# item', other: '# items' })` (Intl.PluralRules, server-lowered like the other formats). |

## C. Kept as they are, with the reason in the guide
| Ask | Why not | What the guide says now |
|---|---|---|
| More than one machine per feature (both) | One machine per feature is what contracts, the lock and HZ005 reason about | A feature per screen when the state differs (orders list and order detail are two features), connected by `exports`. |
| `.slice`, `toFixed`, arbitrary methods in views (admin) | Views are data (principle 4) | `ui.format.number` for decimals, `ui.format.plural`, a `fn` for anything else; not the resolver. |
| A global toast store (admin) | Global client stores are out of scope | A `notice` field per feature, cleared by `after`. |
| Reading `fn` results by property (store) | The `fn` output is one value | Return the value the view needs, or one `fn` per value. |
| Keeping a multi-step form's step across native posts (store) | The server runs the machine per request | Recipe: each step posts every earlier field as hidden inputs (what both agents converged on). |

## D. Guide
`hozu docs database` (new topic): the pool, `app({ dispose })`, transactions, migrations as scripts, `z.coerce.number()`
for numeric form fields and route params, whose-data for staff-shared data (`scope: 'user'` + `access`), a second app
writing the same database (`invalidates` through a signed endpoint). `hozu docs http`: every CSP key (`script`, `style`,
`img`, `font`, `connect`, `frame`, `media`) and an image CDN example. Recipes: layout helper (B5), multi-step checkout
(C), staff roles with `access()` (B6).

## Order and checks
Tools (A) first, then B, then the guide. Each item gets a test; the trials' own repros (`/shop/orders/:id`, the
checkout step change) become fixtures. `pnpm gate`, `hozu check` in every example and `site/`, an independent review,
then 0.22.0 with ADR 0068, and both agents rerun their apps on it.
