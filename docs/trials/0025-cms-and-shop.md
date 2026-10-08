# Trial 0025 — A CMS, a shop admin and a storefront on one database, over four releases (ADR 0068–0072)

**Question:** can an agent build a real, data-backed application with Hozu alone: a CMS plus shop back office, and
the storefront that sells from it, against a real database that both share? And does the framework hold up when it
changes under the apps, release after release, while the same agents keep working on them?

**Answer (qualitative, two agents, one day):**
- **Both apps were built to the end without intervention**, on 0.21.1, from `create-hozu` and the shipped guide only.
  They share one MySQL database: orders placed on the storefront went through their lifecycle in the admin, and stock
  moved in both directions.
- **Six upgrades (each app to 0.22, 0.23 and 0.24) needed no hand edit to migrate.** Each time `hozu migrate`
  rewrote 0 files and reported the IR equal; every change after that was the agent adopting a new form (on 0.23 the
  admin also re-ran `hozu gen` for its Go contract, as `hozu check` asked).
- **The asks shrank from round to round.** After round 1 the agents reported framework friction in back-office work of
  20–30 % of their time (admin) and about 1.5 h of 5 h (storefront, its own estimate). By round 4 they mostly asked for
  tool details and ergonomics, plus structural limits that were declined on principle.
- **Both agents would choose Hozu again for this kind of app.** Both named the same limits: one machine per feature,
  parts that cannot cross features, how little a view can compute, and no global notice.
- **Not measured:** tokens, cost or correctness against a hidden acceptance. This is a record of what two agents did
  and said, and of what the framework changed in reply.

## Setup
- **Agents:** two background Claude agents (`claude-opus-5-5`), started on 2026-10-08 at 01:29 (UTC), each from an
  empty folder:
  - **admin:** "a CMS plus an e-commerce admin back office" (`~/Developer/hozu-trial-admin/admin`);
  - **store:** "the public front end of a content site plus an online shop" (`~/Developer/hozu-trial-store/store`).
- **Rules (both prompts):**
  - Start with `npx -y create-hozu@latest <name> --agent claude`.
  - Learn Hozu only from the generated guide, `npx hozu docs`, CLI help and the installed packages. Do not read the
    Hozu repository or the other agent's folder.
  - No long-running servers: verify with `hozu check`, `get`, `browse`, `call` and `build`.
  - Every detail is the agent's: features, data model, routes, visual style and copy. Images come from picsum.photos,
    and all data is fake.
  - Build it all the way to done: "Do not stop at a skeleton or ask for confirmation".
- **The shared database:** three minutes in, a requirement update replaced in-memory data with a real database:
  - MySQL 8.4 in Docker, database `hozu_trial`, credentials in `hozu-trial-shared/db.env`.
  - The admin owns the schema and writes `hozu-trial-shared/SCHEMA.md`: every table, how the storefront places
    orders and decrements stock, and how to run the migrations. That file is the only thing the storefront reads from
    the admin.
  - The storefront keeps its own tables under a `store_` prefix, and writes its requests to the admin into
    `store-requests.md`.
- **Rounds:**

| Round | Release | What the agents were asked | Decisions |
|---|---|---|---|
| 1 | 0.21.1 | Build the app, then write a candid review: strengths, pain points with time and cause, docs, suggestions, "would you choose it again" | [ADR 0069](../adr/0069-0-22-trial-feedback.md) |
| 2 | 0.22.0 | Upgrade with `hozu migrate`, adopt what is really better, retest, and report fixed / partly / not fixed. Then the admin moves part of its backend to Go with `remote()` + `hozu gen` ([ADR 0068](../adr/0068-resolvers-in-go.md)) and wires revalidation to the storefront | [ADR 0070](../adr/0070-0-23.md) |
| 3 | 0.23.0 | The same retest. The store writes a start command for its site, so that the admin can test revalidation against the real storefront | [ADR 0071](../adr/0071-0-24.md) |
| 4 | 0.24.0 | The same retest, with the declined asks named, so that each agent could say whether it still needs them | [ADR 0072](../adr/0072-0-25.md) E |

- **Who judged:** the lead session (the owner's coordinator) relayed every release note and judged every ask against
  Hozu's principles. The owner approved each ADR. Each later round also told the agents what had changed.
- **Data:** both apps are git repositories (admin 25 commits, store 14). The agents' transcripts stay untracked.

## What was built
| | Admin ("Northwind Supply" back office) | Storefront ("Northwind Supply") |
|---|---|---|
| Pages | 19 routes: dashboard, articles with a preview, pages, categories and tags, media, products, inventory, orders, customers, discounts, settings, sign-in, 404 | 15 routes: home, shop with optional category, product, search, cart, two-step checkout, order confirmation, account, sign-in and register, journal, articles, authors, CMS pages |
| Features | 12 (`account`, `articles`, `customers`, `dashboard`, `discounts`, `inventory`, `media`, `orders`, `products`, `settings`, `sitePages`, `taxonomy`) | 6 (`account`, `cart`, `checkout`, `journal`, `shop`, `site`) |
| Behaviour | Three staff roles (admin, editor, manager) declared as `access`. Order lifecycle (pay, pack, ship with tracking, deliver, cancel, refund, with restock). A stock ledger that never goes negative. CSV export. A dashboard re-read every 60 s (`freshness: { poll: 60 }`) | Filters and sorting in the URL. Variants with live stock. Coupons checked against the admin's rules. Simulated payment with a card that is declined. Guest and member checkout. Wishlist, reviews. Shopper sessions stored in MySQL (`kvSessions`) |
| Data | Idempotent migrations and seed: 4 staff, 28 articles, 8 pages, 38 images, 31 products with 101 variants, 84 customers, 300 orders, 7 coupons | Reads published content and the catalogue. Places orders in one transaction: stock, order lines, ledger, order events, coupon use |
| Between the apps | Calls the storefront's `POST /api/revalidate` after saves that change what the storefront shows (from round 2) | A signed endpoint that `invalidates` its catalogue, content, pages and settings tags |
| Size today (tracked `.ts` + `.css`) | 11 732 lines in 94 `.ts` files. Plus `service/`: Go, 2 422 lines including the generated contract (805) and tests (269) | 5 786 lines in 58 `.ts` files |
| `hozu check` today (0.24) | `0 errors, 0 warnings · contracts 26/35 decisions · lock current` | `0 errors, 0 warnings · contracts 6/6 decisions · lock current` |

- **How the admin worked:** in round 1 the admin split the work across four sub-agents, each in its own copy of the
  app (articles and pages; taxonomy and media; products and inventory; customers, discounts and settings). It then
  merged them and verified again. Its note: merging was easy "because the lock is derived from the code", so there
  was no lock conflict to resolve.
- **The Go service (round 2):**
  - **What moved:** 10 effects. The order lifecycle (with restock in one transaction, `SELECT … FOR UPDATE`), the
    inventory with its ledger, and the dashboard statistics.
  - **Size:** 1 334 lines of Go plus 260 lines of tests, replacing 734 lines of TypeScript. The CSV export stays in
    TypeScript, because only JSON effects go remote. The contract `hozu gen` wrote was 656 lines.
  - **What stayed in Hozu:** access, Invalid and the output check.
  - **Kept for comparison:** the TypeScript version is the git tag `ts-backend`.

## What was verified, per round
All results below are the agents' own reports. The lead did not re-run their acceptance; it re-ran only `hozu check`
on both apps at the end (the table above).

| Round | Admin | Storefront |
|---|---|---|
| 1 (0.21.1) | **Check:** 0 errors, 0 warnings. **Get:** all 19 pages answer 200, a missing record 404, and a signed-out visitor goes to `/login`. **Browse:** sign-in, create and edit an article, ship with a too-short tracking code refused, bulk processing, cancel with restock, stock adjustment, and an editor refused an order change. **Across the apps:** a storefront order (#1301) appeared in the admin; an order simulated from `SCHEMA.md` (#1302) took stock from 9 to 7, and cancelling with restock brought it back to 9 | **Check:** 6/6 contracts, lock current, build passes. **Get:** every page, including 404, with drafts and scheduled content not public. **Browse:** cart, coupon, guest checkout, sign-in, wishlist, review, profile, sign-out. **Other users:** someone else's order redirects a guest to sign-in and is 404 to another member. **Without JS:** cart, sign-in and checkout work. **In the database:** order rows checked directly. The admin had already cancelled one of its test orders |
| 2 (0.22.0) | **Check:** 0 / 0. **Get:** 22 URLs at their expected status (404, 303, CSV). **Browse:** a storefront order through its whole lifecycle | **Check:** 6/6. **Get:** 26 URLs as expected. **Browse:** the main flows with `--js both`. **In the database:** order #1308 written. The admin had marked test order #1307 refunded |
| 2, Go | **Go:** `go vet` and `go test` pass, including two integration tests against MySQL. **Comparison:** 7 `hozu call --json` answers byte-identical to the TypeScript version. **Lifecycle:** storefront order #1308 packed, ship refused for a short tracking code, shipped, refunded with restock; stock back to 15, ledger `sale -2` / `return +2`. **Revalidation:** checked only against a stand-in server, because the storefront's URL was not known yet | — |
| 3 (0.23.0) | **Check:** 0 / 0; `go vet` / `go test` pass. **Lifecycle:** order #1312 packed, shipped, delivered, refunded; stock 21 → 22. **Revalidation, first time against the real storefront:** a product renamed in the admin changed on the storefront at once. **Go errors:** one traced by call id across both logs. **Contract:** a changed declaration staled only its own effect | **Check:** 6/6. **Get:** 24 URLs. **`--js both`:** a guest multi-step checkout with edit-back and a declined card (#1311 / #1312), and a member checkout with a coupon (#1314 / #1315). **In the database:** `coupons.used_count` incremented. **Start command:** `store-endpoint.md` starts the site in about 0.9 s; revalidate answers 200 with the token and 401 without |
| 4 (0.24.0) | **Check:** 0 / 0. **Go:** two new NotFound tests. **Get:** 26 URLs, including filtered and paged lists, detail, preview, 404, CSV. **Lifecycle:** order #1315 cancelled; two items restocked by 1 each. **A vanished variant:** the same message, status 200, with and without JS (in 0.23 the no-JS path answered a 500 page) | **Get:** 24 URLs. **Navigation:** `aria-current` checked on every page type. **`--js both`:** category, filter, product card, colour, add, cart +1, checkout, edit back, pay. Orders #1317 / #1318 checked in the database |

- **A bug of the storefront's own, found in round 4:** product and article cards "could not be clicked in a real
  browser" since round 1.
  - **Cause:** the full-card overlay (`after:absolute after:inset-0`) was on the heading, not on the link.
  - **Why it hid so long:** `hozu get` cannot see it. `hozu browse` clicked, reported nothing, and the step passed.
  - **What changed:** 0.25 made such a click fail the step (E1 below).

## What each round asked, and what was decided
Who: **A** = admin, **S** = storefront. The rows below are the asks that changed the framework or were declined
explicitly; the ADRs list every item.

### Round 1 (0.21.1 → 0.22, ADR 0069)
| Ask | Who | Decision |
|---|---|---|
| `hozu get` / `call` / `browse` never exit while the app holds a DB pool (store: 25 min, ended up patching mysql2 internals; admin: 15 min) | A, S | **Accepted:** one-shot commands exit; `app({ dispose })` closes the pool |
| A page answered 500 with nothing printed (string route param into `z.number()`); "the most expensive one" (25 min) | A | **Accepted:** an invalid query input reaches `onError`, and `get` / `browse` list server errors |
| "N elements rebuilt unchanged (a flash)" named nothing, and had false positives (store 45 min, "the biggest waste"; admin's sub-agents 30+ min) | A, S | **Accepted:** an exact definition of a flash; the report names up to five elements |
| `--with auth` scaffold wrote `accountnotesfeatures: []`; a documented `--select` example was refused; `fill` could not type a newline; `project({ routes })` crashed without a location | A, S | **Accepted:** each fixed |
| A machine carried the chosen quantity to the next product | S | **Accepted:** state is kept only through a view two pages share |
| Prefilling checkout from the member wrapped the form in `ui.query(me)` four times | S | **Accepted:** `seed` may read one query |
| A native `<dialog>` cannot be closed by the machine (sub-agents 20–40 min each) | A | **Accepted:** `ui.dialog({ open: … })` |
| No current page for the sidebar (11 `:has()` CSS rules) | A | **Accepted:** automatic `aria-current`. Reverted in round 3 |
| `session` nullable after `signedIn`; a resolver cannot answer `Forbidden`; `head` cannot read `search`; HZ033 on a hidden enum field; `null` in constant lists; `<a rel>`; "1 items" | A, S | **Accepted:** each, with `ui.format.plural` for the last |
| Layouts, and shared `access` rules repeated 20+ times | A | **Docs only:** a page helper is the layout, and `part()` already shares an `allow` |
| More than one machine per feature (both); `.slice` / `toFixed` in views; a global toast store; reading `fn` results by property | A, S | **Declined:** principle 4 and the out-of-scope list. The guide says what to do instead |
| Keeping a multi-step form's step across native posts | S | **Declined, then accepted in round 2:** first a recipe (hidden fields); in 0.23 a signed `__hozu_state` |

### Round 2 (0.22 → 0.23, ADR 0070) and the Go service
| Ask | Who | Decision |
|---|---|---|
| The canonical URL of `/shop/:category?` carried every default search value (since 0.17), and so did links built from search values | S | **Accepted (bug):** fixed in the route table |
| Route params typed as numbers arrived as strings | A | **Accepted (bug):** params are parsed |
| The next-page link and "Back to editor" were marked `aria-current` | A | **Accepted:** narrowed to paths above the page. That caused the round-3 regression |
| A multi-step checkout needed ~40 lines of hand-written hidden fields without JS | S | **Accepted:** signed machine state in native posts. The store deleted 110 lines and added 33 |
| `ui.link(route, params, { ...search, page })` | A | **Accepted** (`%merge`) |
| `{ allow }` reading `session.role` still typed `session` as nullable | A | **Accepted:** every access but `'anyone'` narrows `session` |
| Lock lines of ~1 KB; `--js both` reporting DIFFERS for a new order number | S | **Accepted:** shorter lines; the differing words are named |
| `app()` cannot read env, so session stores read `process.env` | S | **Declined:** two spellings of `app()`. The guide shows each host's way |
| Go: "fetch failed" with no effect or URL; the error's cause only in the Go log; one fingerprint for the whole contract; ids as `float64`; enums as strings; ten copies of one issue; `commandfor` buttons marked js-only | A | **Accepted:** all seven |

### Round 3 (0.23 → 0.24, ADR 0071)
| Ask | Who | Decision |
|---|---|---|
| The sidebar lost its mark on filtered and paged lists, so the admin put its `:has()` CSS back. "Back to editor" was still marked current | A | **Accepted, as a reversal:** Hozu stops guessing sections. It marks only the address shown, and the render gets `current(route)` to declare sections |
| `--select` without descendant selectors; `hozu call` on an endpoint not showing invalidated tags; an old contract reported as "every effect is missing"; the migrate summary on one line | A, S | **Accepted** |
| ~30 type errors from one Go type per untitled enum field | A | **Accepted as a note:** `hozu gen` suggests `.meta({ title })`. **Declined:** merging enums by shape |
| A cached query without tags could not be revalidated by the other app (the store's own omission) | S | **Docs only:** a query another app's writes change needs a tag. **Declined:** a diagnostic, because tag-less time-based freshness is legitimate |
| A native post that hit a Go error answered a 500 page | A | **Docs only:** an expected failure is a declared error |
| `{ allow }` narrowing the fields its predicate checks (`session.customer`) | S | **Declined:** the guest session is the app's model, and the narrowing would be fragile |
| A no-JS fallback for machine-controlled dialogs; a 308 to the canonical URL for any search; `browse` showing production errors | A, S | **Declined:** the native dialog already works without JS; tracking parameters; tools are for debugging |

### Round 4 (0.24 → 0.25, ADR 0072 E)
| Ask | Who | Decision |
|---|---|---|
| A click that landed on another element passed silently (the card overlay) | S | **Accepted:** `browse` fails the step and names what was hit |
| `current(route)` cannot mark the "Apparel" category | S | **Accepted:** `current(route, params)` |
| `current(a, b)` or route groups; "`\|\|` runs at record time inside `.map`" | A | **Declined:** `current(a) \|\| current(b)` already says it. The second point was **not so**: `\|\|` on a reference lowers to `%cond`, and the guide now shows a constant nav list |
| "The first migrate printed an empty change list" | A | **Not a bug:** the agent's own `grep` filtered the bullets out |
| `--select` output hides `class` | S | **Accepted** |
| A diagnostic for "expectable" thrown errors; checking the Go service at start; a global toast store | A | **Declined:** a heuristic on message text; the 409 already names the effect; principle |

In round 4, asked about the two round-3 refusals, the storefront said:
- **`allow` narrowing fields:** "low, I can accept the refusal".
- **The untagged-cache diagnostic:** "largely not needed any more", because `hozu call site.revalidate --write` now
  lists what it invalidates and refreshes.

## How the upgrades went
| Upgrade | `hozu migrate` | Code the agent changed afterwards (excluding lock and skill) |
|---|---|---|
| Admin → 0.22 | "rewrote 0 files", then "the IR equals the old one after the declared mapping", "hozu check: ok"; under 5 minutes | 28 files, +141 / −140 |
| Store → 0.22 | the same | 12 files, +110 / −125 |
| Admin, TypeScript → Go (0.22) | — | TypeScript side +169 / −782; Go 1 334 + 260 tests |
| Admin → 0.23 | IR equal; `hozu check` asked for `hozu gen` (HZ093) | Contract +199 / −68, Go +94 / −84; in TypeScript, 10 `.meta` lines, 10 pager links, 2 `session` reads and 15 lines of CSS put back (no total reported) |
| Store → 0.23 | IR equal | +57 / −160 |
| Admin → 0.24 | IR equal; the Go service did not need a rebuild | 19 files, +92 / −40 |
| Store → 0.24 | 0 files rewritten, IR equal | 3 files, +21 / −19 |

- **The storefront in round 2:** the upgrade was "the best framework upgrade process I have used". Its one complaint,
  a one-line change summary, became bullets in 0.24.
- **The admin in round 2:** it asked migrate to point at code that a new form could replace (for example
  `body:has(` or `session?.`). That was not taken up.

## The agents' verdicts (translated)
| | Admin | Storefront |
|---|---|---|
| Round 1 strengths | Diagnostics that come with a fix. `access` that turns into `Forbidden`. `invalidates` that re-reads pages "without one line of refetch". `hozu browse` with actors. Behaviour changes reviewable in the lock: "no mainstream framework offers this" | Diagnostics. Render modes derived from `scope` / `freshness`. No-JS forms. Verification without a server: "the most AI-friendly verification flow I have used". SEO derived from `head` |
| Round 1 weaknesses | "Very limited expressiveness in views", so presentation logic moved into resolvers. Dialogs, flashes, DB lifecycle, a 500 it could not see, CSP docs, no layout | The CLI hanging with a pool. Flash reports that named nothing. No-JS multi-step state. No prefill from server data. One machine per feature |
| Round 1 "again?" | "Yes, with conditions"; it would reserve 20–30 % of the time for framework friction | "Would choose again". For "AI writes, people review" public sites, "the most reassuring framework I have used" |
| Round 2 | "Will choose it": friction "down from 20–30 % to 10–15 %". Go: keep TypeScript "unless a Go service already exists or there is a clear performance need" | 13 of 21 pain points fixed, 4 partly. Retest time "from about an hour to about 15 minutes" |
| Round 3 | Go debugging "close to the 'one process' level"; one regression (the sidebar mark) | "My first choice among similar projects"; "would pick Hozu again without hesitation" |
| Round 4 | `current(route)` is "better overall". **Disagrees:** the framework knows the route hierarchy, yet leaves sections entirely to the app; a missed detail route gets no diagnostic | Explicit sections are "better than 0.23". The release's biggest gain was "`browse` catching my own bug" |
| Still open at the end | `current()` over several routes. A diagnostic for expectable errors. A Go health check at start. Machine dialogs without JS. A global notice | `current(route, params)` (done in 0.25). One machine per feature. Parts across features (`productTile` written three times). `app()` reading env |

## What changed in Hozu
The trial drove four releases. Each ADR records every ask with the decision and the reason.
- **0.22 ([ADR 0068](../adr/0068-resolvers-in-go.md), [ADR 0069](../adr/0069-0-22-trial-feedback.md)):**
  - one-shot commands exit, and `app({ dispose })`;
  - server errors surface in `onError`, `get` and `browse`;
  - flash reports name their elements;
  - `seed` from a query, `ui.dialog({ open })`, `fail('Forbidden')`, `signedIn` narrowing, `head` with `search`;
  - plurals, `rel`, `null` in lists;
  - `hozu docs database`;
  - Go resolvers through `remote()`.
- **0.23 ([ADR 0070](../adr/0070-0-23.md)):**
  - the canonical-URL and route-param bugs;
  - signed machine state for no-JS multi-step forms;
  - `{ ...search }` in links, and narrowing for every access;
  - the Go path's call ids, per-effect fingerprints and named enums;
  - `Internal error` in production.
- **0.24 ([ADR 0071](../adr/0071-0-24.md)):**
  - sections are declared with `current(route)` instead of guessed;
  - descendant `--select`, endpoint tags in `hozu call`, migrate bullets;
  - the two refusals above.
- **0.25 ([ADR 0072](../adr/0072-0-25.md) E):**
  - `browse` fails a click that lands on another element;
  - `current(route, params)`;
  - `class` in `--select` output.
- **The lesson recorded in ADR 0071:** accepting an ask as stated can be wrong.
  - 0.22's automatic `aria-current` answered the admin's ask. It misfired on the next-page link, and the narrower rule
    of 0.23 misfired on filtered lists.
  - What a section is belongs to the app. The owner's instruction for 0.24 was to judge asks by the framework, not to
    take them as given.

## Limits
- **Qualitative.** No hidden acceptance, no held-out changes, no token or cost measurement, and no comparison
  framework. The numbers above are counts the agents reported (URLs, orders, stock, lines changed) and the line
  counts of the repositories today.
- **The agents graded their own work.** Their "verified" means their own `hozu check` / `get` / `browse` runs and
  database queries. The storefront's broken cards passed three rounds of its own verification.
- **Time figures are the agents' estimates.** The transcripts show about 50 minutes of wall clock from start to the
  first build's report for each agent, with the admin running four sub-agents in parallel. The storefront's "about
  5 hours" and the per-item minutes are therefore not measurements.
- **One model, one run, two apps.** Both agents were `claude-opus-5-5`. They worked in parallel on one machine,
  against one shared database.
- **The lead judged the asks**, and the same session wrote this record. Each round's prompt also told the agents what
  had changed, which steers a retest towards the fixes.
- **The framework moved under the apps.** Retests show that a fix works for the agent that asked for it; they do not
  show that the fix generalises.
- **Writes on a shared database:** `--js both` wrote twice to the shared database, and test orders and edits stayed
  in it. Both agents report cleaning up most of them.
- **The managed instructions** of the organisation shaped the form of every report (tables, three next steps), as in
  earlier trials.
