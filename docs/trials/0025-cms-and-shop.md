# Trial 0025 — A CMS, a shop admin and a storefront on one database, over nine releases (ADR 0068–0078)

**Question:** can an agent build a real, data-backed application with Hozu alone: a CMS plus shop back office, and
the storefront that sells from it, against a real database that both share? And does the framework hold up when it
changes under the apps, release after release, while the same agents keep working on them?

**Answer (qualitative, two agents, two days):**
- **Both apps were built to the end without intervention**, on 0.21.1, from `create-hozu` and the shipped guide only.
  They share one MySQL database: orders placed on the storefront went through their lifecycle in the admin, and stock
  moved in both directions.
- **Eight upgrades (each app to 0.22, 0.23, 0.24 and 0.25) needed no hand edit to migrate.** Each time `hozu migrate`
  rewrote 0 files and reported the IR equal; every change after that was the agent adopting a new form (on 0.23 the
  admin also re-ran `hozu gen` for its Go contract, as `hozu check` asked).
- **The two upgrades to 0.26.1 were the first with a breaking change.** `hozu migrate` listed each old
  `ui.send(…, { keys })` by file and line, and the second run, after `npm install`, flagged the IR difference at those
  places as an undeclared behaviour change. Each agent took about 5 minutes by hand.
- **The asks shrank from round to round.** After round 1 the agents reported framework friction in back-office work of
  20–30 % of their time (admin) and about 1.5 h of 5 h (storefront, its own estimate). By round 4 they mostly asked for
  tool details and ergonomics, plus structural limits that were declined on principle. In round 5 the one new
  feature they tried, keyboard shortcuts, showed four limits with one cause, and 0.26 redesigned it. In round 6 the
  redesign held for both agents; the new asks came from 0.26's one-command deploys, which could not build either app
  for Workers or Vercel and did not say why. In round 7 those messages worked and the storefront ran in Docker, but
  `hozu migrate` broke the patch upgrade itself. In round 8, on 0.26.3, both apps upgraded by the printed `next:`
  lines alone and ended with a clean `hozu check`; round 9, on 0.26.4, did the same and found no regression. The
  storefront: "nothing currently blocks normal development".
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
| 5 | 0.25.0 | The same retest, on the 0.25 changes: `current(route, params)`, keyboard shortcuts (`keys` on `ui.send`), the covering-click check, `class` in `--select` | [ADR 0073](../adr/0073-0-26.md) B, C |
| 6 (2026-10-09) | 0.26.1 | The same retest, on the 0.26 changes: `keys` on the control it presses, the coverage count, `--select`, and the new `hozu build --target node \| workers \| vercel` | [ADR 0075](../adr/0075-0-26-2.md) |
| 7 | 0.26.2 | The same retest, on 0.26.2's deploy messages: the import chains, `--target node` with Docker, focus after `press` | [ADR 0076](../adr/0076-0-26-3.md) |
| 8 | 0.26.3 | Upgrade only by the printed `next:` lines; retest the mismatch warning, kept Docker files, `--out`, focus notes; the store builds and inspects the image | [ADR 0077](../adr/0077-0-26-4.md) |
| 9 | 0.26.4 | The same, with `check` run before installing; shortcuts inside dialogs; the image name and contents | [ADR 0078](../adr/0078-0-26-5.md) |

- **Who judged:** the lead session (the owner's coordinator) relayed every release note and judged every ask against
  Hozu's principles. The owner approved each ADR. Each later round also told the agents what had changed.
- **Data:** both apps are git repositories (after round 4: admin 25 commits, store 14). The agents' transcripts stay untracked.

## What was built
| | Admin ("Northwind Supply" back office) | Storefront ("Northwind Supply") |
|---|---|---|
| Pages | 19 routes: dashboard, articles with a preview, pages, categories and tags, media, products, inventory, orders, customers, discounts, settings, sign-in, 404 | 15 routes: home, shop with optional category, product, search, cart, two-step checkout, order confirmation, account, sign-in and register, journal, articles, authors, CMS pages |
| Features | 12 (`account`, `articles`, `customers`, `dashboard`, `discounts`, `inventory`, `media`, `orders`, `products`, `settings`, `sitePages`, `taxonomy`) | 6 (`account`, `cart`, `checkout`, `journal`, `shop`, `site`) |
| Behaviour | Three staff roles (admin, editor, manager) declared as `access`. Order lifecycle (pay, pack, ship with tracking, deliver, cancel, refund, with restock). A stock ledger that never goes negative. CSV export. A dashboard re-read every 60 s (`freshness: { poll: 60 }`) | Filters and sorting in the URL. Variants with live stock. Coupons checked against the admin's rules. Simulated payment with a card that is declined. Guest and member checkout. Wishlist, reviews. Shopper sessions stored in MySQL (`kvSessions`) |
| Data | Idempotent migrations and seed: 4 staff, 28 articles, 8 pages, 38 images, 31 products with 101 variants, 84 customers, 300 orders, 7 coupons | Reads published content and the catalogue. Places orders in one transaction: stock, order lines, ledger, order events, coupon use |
| Between the apps | Calls the storefront's `POST /api/revalidate` after saves that change what the storefront shows (from round 2) | A signed endpoint that `invalidates` its catalogue, content, pages and settings tags |
| Size after round 4 (tracked `.ts` + `.css`) | 11 732 lines in 94 `.ts` files. Plus `service/`: Go, 2 422 lines including the generated contract (805) and tests (269) | 5 786 lines in 58 `.ts` files |
| `hozu check` after round 4 (0.24, the lead's run) | `0 errors, 0 warnings · contracts 26/35 decisions · lock current` | `0 errors, 0 warnings · contracts 6/6 decisions · lock current` |

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
on both apps after round 4 (the table above). After round 5 the agents reported `contracts 26/35 decisions` (admin)
and `contracts 7/8 decisions` (store), both with 0 errors and 0 warnings; the gap is a counting bug (C1 below), not
missing contracts. After round 6 they reported `contracts 25/25 decisions` (admin) and `6/6` (store): the count
was fixed. Rounds 7–9 kept both counts.

| Round | Admin | Storefront |
|---|---|---|
| 1 (0.21.1) | **Check:** 0 errors, 0 warnings. **Get:** all 19 pages answer 200, a missing record 404, and a signed-out visitor goes to `/login`. **Browse:** sign-in, create and edit an article, ship with a too-short tracking code refused, bulk processing, cancel with restock, stock adjustment, and an editor refused an order change. **Across the apps:** a storefront order (#1301) appeared in the admin; an order simulated from `SCHEMA.md` (#1302) took stock from 9 to 7, and cancelling with restock brought it back to 9 | **Check:** 6/6 contracts, lock current, build passes. **Get:** every page, including 404, with drafts and scheduled content not public. **Browse:** cart, coupon, guest checkout, sign-in, wishlist, review, profile, sign-out. **Other users:** someone else's order redirects a guest to sign-in and is 404 to another member. **Without JS:** cart, sign-in and checkout work. **In the database:** order rows checked directly. The admin had already cancelled one of its test orders |
| 2 (0.22.0) | **Check:** 0 / 0. **Get:** 22 URLs at their expected status (404, 303, CSV). **Browse:** a storefront order through its whole lifecycle | **Check:** 6/6. **Get:** 26 URLs as expected. **Browse:** the main flows with `--js both`. **In the database:** order #1308 written. The admin had marked test order #1307 refunded |
| 2, Go | **Go:** `go vet` and `go test` pass, including two integration tests against MySQL. **Comparison:** 7 `hozu call --json` answers byte-identical to the TypeScript version. **Lifecycle:** storefront order #1308 packed, ship refused for a short tracking code, shipped, refunded with restock; stock back to 15, ledger `sale -2` / `return +2`. **Revalidation:** checked only against a stand-in server, because the storefront's URL was not known yet | — |
| 3 (0.23.0) | **Check:** 0 / 0; `go vet` / `go test` pass. **Lifecycle:** order #1312 packed, shipped, delivered, refunded; stock 21 → 22. **Revalidation, first time against the real storefront:** a product renamed in the admin changed on the storefront at once. **Go errors:** one traced by call id across both logs. **Contract:** a changed declaration staled only its own effect | **Check:** 6/6. **Get:** 24 URLs. **`--js both`:** a guest multi-step checkout with edit-back and a declined card (#1311 / #1312), and a member checkout with a coupon (#1314 / #1315). **In the database:** `coupons.used_count` incremented. **Start command:** `store-endpoint.md` starts the site in about 0.9 s; revalidate answers 200 with the token and 401 without |
| 4 (0.24.0) | **Check:** 0 / 0. **Go:** two new NotFound tests. **Get:** 26 URLs, including filtered and paged lists, detail, preview, 404, CSV. **Lifecycle:** order #1315 cancelled; two items restocked by 1 each. **A vanished variant:** the same message, status 200, with and without JS (in 0.23 the no-JS path answered a 500 page) | **Get:** 24 URLs. **Navigation:** `aria-current` checked on every page type. **`--js both`:** category, filter, product card, colour, add, cart +1, checkout, edit back, pay. Orders #1317 / #1318 checked in the database |
| 5 (0.25.0) | **Check:** 0 / 0; `hozu build` passes. **Lifecycle:** storefront order #1304 shipped, delivered, refunded; stock 62 → 63. **Stock adjustment** with and without JS. **Go stopped:** a clear error. **Sidebar:** `aria-current` right on 9 page types, filtered and paged lists included. **Shortcuts, two actors:** Priya marked #1304 packed, Mei pressed `r` on the dashboard and the activity feed showed it at once; `Escape` closed a toast | **Check:** green; 3 machine changes accepted into the lock. **Get:** 26 URLs. **`--js both`:** the round-4 flow; orders #1319 / #1320 checked in the database. **The old card bug:** the overlay put back on the heading failed the click step with and without JS, naming the `<h3>` (then reverted). **Shortcut:** `/` opens `/search` with JS, waits while the person types in a field, and is reported `js-only` without JS. **Start command:** ready in 0.7 s |
| 6 (0.26.1) | **Check:** 0 / 0, `contracts 25/25 decisions`; `hozu build` and `--target node` pass. **Get:** 26 URLs at their expected status. **Shortcuts:** with JS, `Mod+s` saved an article, a page and a product (`+ Article saved`); `Escape` closed a toast; the server writes `aria-keyshortcuts="Control+S Meta+S"`; without JS the step says `js-only (a shortcut needs JavaScript)` and the button still works. **Lifecycle:** storefront order #1319 shipped, delivered, refunded, 2 items returned; the ledger is right with the store's #1321 / #1322 (−2 each) in between: 9 − 4 + 2 = 7. **Go:** a declared error and a stopped service give the right messages. **`--js both`:** the two sides now print their own result. **Deploy:** `--target workers` / `vercel` fail (below) | **Check:** green, `contracts 6/6`; 3 lock changes accepted. **Shortcut:** `/` focuses the header search field (seen with `--select ':focus'`), then `press Enter` → `/search?q=`; `js-only` without JS. **`--js both`:** the round-4 flow with an edit-back adding `Apt 6`; orders #1321 / #1322 checked in the database (`paid`, the address line, one stock row, events `placed,paid`). **Coverage:** a shared `on` with `navigate` put back for the test counted 7/7 (0.25: 7/8), then reverted. **The card bug** put back once more: still fails the step, naming `<h3 class="mt-1…">`. **Deploy:** `--target node` passes; `--target workers` / `vercel` fail (below) |
| 7 (0.26.2) | **Check:** 0 / 0, `contracts 25/25 decisions` once the packages were raised by hand (below). **Lifecycle:** storefront order #1322 cancelled with `--js both`: stock 7 → 9 and one `cancel +2` in the ledger; the second mode was refused `NotAllowed`, so stock came back once. **Shortcut:** `Mod+s` on the article editor, `js-only` without JS. **Deploy:** `--target workers` / `vercel` name the chains and the ways out, exit 2 with `build`, and a second run gives the same message; `--target node` lists the Go service and three loopback env values with the password removed; the covered click names `the dialog "Create a discount"` | **Check:** `contracts 6/6 · lock current`. **`--js both`:** the round-4 flow; orders #1323 / #1324 checked in the database (`paid`, the address line `Bât B`, one stock row, events `placed,paid`). **Docker, the first deploy of the trial:** the `--target node` image built in about 10 s (Docker Desktop 27.4.0), the container was ready in about 2 s with `DATABASE_URL` on `host.docker.internal`, and `/`, a category, a product with stock from the database, a journal filter, a page and the cart answered 200, a missing product 404, and `POST /api/revalidate` with the token `{"ok":true}`; container and image removed afterwards |
| 8 (0.26.3) | **Upgrade:** `migrate` → `npm install` → `npx hozu check`: `0 errors, 0 warnings · contracts 25/25 decisions · lock current`, nothing by hand. **Deploy:** with the `service` line removed from its kept `.dockerignore`, `--target node` said `the kept .dockerignore lacks: service`; `--out` wrote `Dockerfile.dockerignore` and printed `docker build -f …`; failed edge builds left no folder. **Focus:** `press Mod+s … focus stays on <textarea name="excerpt"> "Excerpt"`, `press Tab — focused <textarea name="body"> "Body"`. **Lifecycle:** order #1324 packed, shipped, delivered, refunded: stock 5 → 7, ledger `sale -2 / return +2`, one row per stage; the second mode refused `NotAllowed` | **Upgrade:** the same, `contracts 6/6 · lock current`; `--update-lock` during the mismatch left the lock byte-identical. **Docker:** built with exactly the printed command; inside the image no `.env`, no `.git`, and `node_modules` from `npm ci` (no `typescript`); `/`, a category, a product, a journal filter 200 and a missing product 404 from the container. **Focus:** `press /` named the header field of two `name="q"` fields; at 390 px `no visible control has / (1 hidden)`. **Orders:** #1325 / #1326 checked in the database; 25 URLs at their expected status |
| 9 (0.26.4) | **Before upgrading:** the 0.26.4 CLI on the 0.26.3 app stopped with two lines and exit 2, no diagnostics, the lock untouched. **Upgrade:** `done: removed the record of an earlier migration .hozu/migrate-0.23.json`, `updated .claude/skills/hozu`; then `contracts 25/25 decisions · lock current`. **Dialogs:** `Mod+Enter` added to submit in the ship, cancel and refund dialogs (kept); the same key in two dialogs passes HZ014; `no control in the open dialog has Mod+s`, `no visible control has Mod+Enter (3 hidden)`; `press r` → `no control has r`. **Deploy:** `docker build -t admin .`; the kept `.dockerignore` named its four missing agent lines. **Lifecycle:** order #1326 packed, shipped and refunded with `Mod+Enter`: stock 3 → 5, ledger `sale -2 / return +2` | **Before upgrading:** two lines, exit 2; after `migrate`, the fix became `npm install`. **Upgrade:** `updated .claude/skills/hozu` without a separate `hozu skill`; `contracts 6/6 · lock current`. **Dialog:** `/` on the menu dialog's search field passes HZ014 (refused in round 8) and was kept; at 390 px `press /` with the menu open focused `<input name="q"> "Search"`, the menu's field. **Docker:** `-t store`; inside `/app` no `.claude`, `CLAUDE.md`, `.env` or `.git`. **Orders:** #1327 / #1328 in the database; 25 URLs as before |

- **A bug of the storefront's own, found in round 4:** product and article cards "could not be clicked in a real
  browser" since round 1.
  - **Cause:** the full-card overlay (`after:absolute after:inset-0`) was on the heading, not on the link.
  - **Why it hid so long:** `hozu get` cannot see it. `hozu browse` clicked, reported nothing, and the step passed.
  - **What changed:** 0.25 made such a click fail the step (E1 below). In round 5 the store put the overlay back on
    the heading on purpose: the step failed in both modes, "what took me four experiments last time is now said in one
    line".
- **The owner's manual test (round 5; the owner's, not the agents'):** the owner used both apps in real browsers and
  found two problems that no agent run could see.
  - **Safari could not sign in under `hozu serve`:** the session cookie was `Secure` over plain http on 127.0.0.1, which
    Safari refuses. Fixed in 0.26.
  - **Arc blanks the window on every document load,** query-only changes included. A plain multi-page site without
    Hozu does the same, and Chrome and Safari do not. Documented, not worked around: a client router would reverse
    ADR 0043 I for one browser (ADR 0073 D).

- **The one-command deploys (0.26, first tried in round 6):**
  - **`--target node`** built for both: it printed what the platform needs (`SESSION_SECRET`, the server env) and
    wrote a `Dockerfile` and `.dockerignore`. Neither agent reported running the image; the store says it did not run
    `docker build`.
  - **`--target workers` and `vercel`** failed for both, because their TypeScript resolvers use `mysql2` over TCP,
    which a Worker or an Edge Function cannot open. The failure was right; the message was not: esbuild's raw output
    ("Build failed with 25 errors" for the store, 23 for the admin; 5 shown), no file of the app named, no way out,
    and `--json` reported the code `usage`.
  - **The retry was refused:** the failed build left a partial `dist/workers`, and the next run answered "is not empty
    and no earlier --target workers output … remove this one yourself".
  - Both asked for the import chain and a way out (`--target node`, a database driver over HTTP, or `remote()`).
- **The deploys again (0.26.2, round 7):** both agents called the new messages a large improvement ("from esbuild
  errors I could not read to knowing the next step"). The storefront built the `--target node` image and served the
  shop from a container against the shared database (row 7 above). The admin planned a second container for the Go
  service. Their remaining notes: the message said Workers "has no Node built-ins", which is false under Cloudflare's
  `nodejs_compat`; `--out` printed a `docker build` that would run without the app as context; a kept
  `.dockerignore` did not get the Go service's line, silently.

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

### Round 5 (0.25 → 0.26, ADR 0073 B, C)
| Ask | Who | Decision |
|---|---|---|
| `Mod+s` to save a form: a keydown has no form fields (HZ027) | A | **Accepted, as a redesign (B):** `keys` moves from `ui.send` to the control it presses. A submit button with `keys: ['Mod+s']` submits its form |
| `/` cannot focus the search field; a shortcut needs a machine (the store hung it on the newsletter's machine); a final state takes no shared `on` (the store removed `final` from `subscribed`) | S | **Same redesign (B):** a field with `keys` is focused, a link or button is clicked; no machine is needed, and the machine sees the same event as a click |
| Coverage said 26/35 and 7/8 with no HZ016; `hozu why` marked a shared `on`'s copies uncovered | A, S | **Accepted (bug):** the summary and `hozu why` count a shared `on` once, as HZ016 does |
| `--select` drowned by long classes | A, S | **Accepted:** class printed last and cut at 60 characters; `--json` has it whole |
| Keep the call id for staff when production masks `Unexpected` (the admin disagreed with "never `e.message`") | A | **Guide, no API:** a staff tool may show `Internal error (call id)`; a customer page shows a fixed text |
| Mark sections automatically, or warn when a detail route is in no `current()` | A | **Declined:** what a section is belongs to the app (ADR 0071); the warning would guess which route belongs where |
| Prepending to a keyed `ui.each` reported existing rows as a flash | A | **To verify:** a detector false positive or a real rebuild |
| A covering element named only `<div>`; the CHANGELOG not in the packages | A | **Accepted:** named by id, `aria-label` or first class; `CHANGELOG.md` ships in `@hozu/cli` and `hozu migrate` prints the step's entry |
| `prerendered` never shows in `browse`; `--js both` repeats the arrival on the split lines | S | **Docs** (Chrome disables prerender under DevTools interception); **bug**, fixed |
| `app(({ env }) => …)`, more than one machine per feature, kit components taking data objects | S | **Declined,** unchanged reasons. The redesign removes the reason the store gave for a second machine |

The store also noted that the guide undersold `current(shop, { category })`: it works on query data inside `ui.each`,
not only over a constant list.

### Round 6 (0.26.1 → 0.26.2, ADR 0075)
| Ask | Who | Decision |
|---|---|---|
| An edge build that cannot work prints esbuild's raw errors (5 of 25 / 23 shown), names no file of the app, gives no way out, and `--json` says `usage` | A, S | **Accepted (A1):** the bundle records the chain from the app file to the Node built-in (`server/db.ts → mysql2 → net, tls`); the build stops with `build` and names the ways out: `--target node`, a database driver over HTTP, or `remote()` |
| A failed build leaves a partial folder that refuses the retry | A, S | **Accepted (A2):** the output is removed when the build fails; a folder holding only an earlier partial build counts as this target's output |
| Know before choosing a platform, not at build time | S | **Accepted (A3):** `hozu build` without `--target` says per target whether it can serve the app, with the chain when it cannot |
| `--target node` does not mention the Go service; the `Dockerfile` copies `service/` | A | **Accepted (A4):** services reached through `remote()` are listed under "the platform needs", and their folders go in `.dockerignore` |
| `DATABASE_URL` on 127.0.0.1 cannot be reached from inside a container | S | **Accepted (A5):** `--target node` names each env value on a loopback host |
| A covering element named by its first class; the admin needed "the Create a discount dialog" | A | **Accepted (A6):** the nearest dialog's accessible name comes first |
| `press` does not show where focus went (the store needed `--select ':focus'`) | S | **Accepted (A7):** the step says `focused <input name="q">` |
| `.vercel/` is not in the scaffold's `.gitignore` | A | **Accepted (A8)** |
| A global toast store (third time) | A | **Declined:** no global mutable client store; the recipe "A notice after saving" stays |
| `app(({ env }) => …)`, more machines per feature, kit components taking data objects | S | **Declined,** unchanged reasons; 0.26's `keys` removed the reason the store gave for a second machine |
| Enabling Cloudflare's `nodejs_compat` so that Node modules bundle anyway | — (weighed by the lead) | **Declined:** a second runtime contract to keep and test; HTTP drivers and `remote()` are the supported ways |

Round 5's open item, a prepended row reported as a flash, did not recur: the admin's `r` refresh in 0.26 showed only
the content change.

### Round 7 (0.26.2 → 0.26.3, ADR 0076)
| Ask | Who | Decision |
|---|---|---|
| `hozu migrate` from 0.26.1 went straight to `verify`: `@hozu/*` stayed at `^0.26.1`, the lockfile kept 0.26.1, and the 0.26.2 CLI checked the old packages (216 / 688 errors, 50 IR places such as `"%concat" → "?"`) | A, S | **Accepted (A1), a bug:** versions compare in full; a patch release is phase `upgrade`, which raises `@hozu/*` and says install, then `hozu check` |
| The verify compared a record saved at the 0.25 migration, so the agents' own edits showed as undeclared behaviour changes, with no way to refresh it | A, S | **Accepted (A2), a bug:** a record names the version it was written for; any other record is removed with a note |
| `hozu check` should say when the CLI and the packages differ | A | **Accepted (A3):** it fails first with both versions and the fix |
| "Workers has no Node built-ins" is false under `nodejs_compat`; `crypto` in a password hash looks like a blocker | A, S | **Accepted as wording (A4):** the message says what the build does (it bundles no built-ins; `nodejs_compat` stays off). Enabling it stays declined (ADR 0075) |
| A kept `.dockerignore` was not updated and nothing was said | A | **Accepted (A5):** kept files are listed, with the lines they lack |
| `--target node --out` printed `docker build -t app .` | A, S | **Accepted (A6):** `docker build -f <out>/Dockerfile -t app <app>` |
| A failed `--target vercel` left an empty `.vercel/` | S | **Accepted (A7)** |
| `focused <input name="q">` matched two fields; `Mod+s` and `Escape` said nothing about focus | A, S | **Accepted (A8):** the note adds the accessible name and is given on every press (`focus stays on`, `focus left`) |
| `/` at 390 px did nothing, silently (the header field is hidden there) | S | **Accepted (A9):** `no visible control has /` |
| Chains starting at `app.ts` | A | **Declined:** the first app file that imports the module is where the fix goes |
| `app(({ env }) => …)`, kit components taking data objects, more machines per feature | S | **Declined,** unchanged reasons |

### Round 8 (0.26.3 → 0.26.4, ADR 0077)
| Ask | Who | Decision |
|---|---|---|
| HZ014 refused one `/` inside the mobile menu's `<dialog>` and one in the header, which the runtime allows | S | **Accepted (A1), a bug:** a `dialog` is its own scope for shortcuts (a popover is not modal and stays in the page scope) |
| A mismatch still printed every diagnostic under its warning (216 errors / 3 449 lines) | A, S | **Accepted (A2):** `hozu check` stops before loading, with one error and the fix |
| The fix said `migrate` after migrate had run | S | **Accepted (A3):** the fix follows the state (`npm install` when `package.json` already names the version) |
| A removed record listed under `by hand:`; an older `migrate-0.23.json` left behind | A, S | **Accepted (A4, A5):** a `done:` list; every earlier record removed |
| The upgrade did not refresh the agent guide | S | **Accepted (A6)** |
| `press r` on a page where no control has `r` said nothing; without JS, `Escape` was called a shortcut | A, S | **Accepted (A7, A8)** |
| `docker build -f ../../../../../tmp/…` and `-t app`; `.claude` in the image | S | **Accepted (A9, A10):** absolute paths outside the folder, the image named after `package.json`, agent files ignored |
| `focus on <body>` when nothing had focus before or after | A | **Declined:** focus leaving is reported; a line on every unchanged press is noise |
| A Dockerfile or compose file for the Go service | A | **Declined:** how a service builds is the app's own |
| The three structural asks | S | The store: "I still think they have value, but I understand they are not on this road; I will not pursue them" |

### Round 9 (0.26.4 → 0.26.5, ADR 0078)
| Ask | Who | Decision |
|---|---|---|
| The mismatch fix `npx hozu migrate` runs the project's older CLI and does nothing | A, S | **Accepted (A1), a bug:** the fix names the version |
| Focus notes do not name buttons and links | A | **Accepted (A2)** |
| Without JS, a key no control has says `nothing is focused` | A | **Accepted (A3)** |
| `wrote ../../…` next to an absolute `docker build -f` | S | **Accepted (A4)** |
| A shrinking progress list (five steps to two) reported as a flash | A | **Investigated:** the first reading (the new row fades in) was wrong and is corrected in ADR 0079 B: nothing fades or blinks; browse counts the new row's unchanged child as rebuilt because it cannot see keys |
| `--update-ignore`; a version tag on the image | A, S | **Declined** |

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
| Admin → 0.25 | 0 files rewritten, IR equal, `hozu check: ok`; `hozu gen` reported the Go contract unchanged | 3 files, +22 / −25. The 22-line, 11-level nested ternary of the sidebar became one line per section with `current()` (+18 / −25); two shortcuts; `Mod+s` tried and reverted (HZ027) |
| Store → 0.25 | 0 files rewritten, IR equal | 2 files, +17 / −6: `current(shop, { category })` on the header categories, the `/` shortcut with a contract, `final` removed from one state |
| Admin → 0.26.1 | **The first breaking change.** "rewrote 0 files", and under `by hand:` the 3 old forms by line (`features/dashboard/views.ts:21  keys left ui.send: put them on the control …`). After `npm install` the second run reported "the IR differs from the saved one … at 3 places" and asked to review each. About 5 minutes; the Go contract unchanged | Shortcuts: 6 files, +5 / −8 (`r` on a `Button`, `Escape` on the kit `Toast`'s close button, `Mod+s` on the article, page and product editors). Also the generated `Dockerfile` / `.dockerignore` (+16), `@hozu/bundle`, `.vercel` in `.gitignore` |
| Store → 0.26.1 | The same: `features/site/views.ts:152` listed by hand; the second run `! …/Footer/root/children/0/on/keydown/keys: ["/"] → absent`, `hozu check: failed`, "Review each IR difference: it is a behaviour change the migration did not declare". About 5 minutes | 5 files, +33 / −26; code 2 files, +5 / −14: `keys: ['/']` on the header search field; the footer machine's workaround (`ui.window` listener, `OpenSearch`, the shared `on`, its contract) removed and `final` put back on `subscribed`. Plus the generated `Dockerfile` / `.dockerignore` |

| Admin → 0.26.2 | **A regression of the tool, not the app.** `0.26.1 → 0.26.2: verify` with no rewrite and no `next: npm install`; `the IR differs … at 50 places`, `hozu check: failed · types ok · 688 errors`. `npm install` kept 0.26.1 (the lockfile). After raising 13 packages by hand, `hozu check: ok`, but the 50 places stayed: the record dated from before its round-6 edits | `package.json` ±13; `service` added to `.dockerignore` by hand (+1); no code |
| Store → 0.26.2 | The same: 216 errors, 50 places; about 10 minutes to find that the packages had not moved | `package.json` ±13; no code |
| Admin → 0.26.3 | `0.26.2 → 0.26.3: upgrade, no source changes`, 13 packages raised, the stale record removed, `next: npm install` and `next: npx hozu check`; after them `hozu check` clean. "No workaround was needed" | `package.json` ±13 by migrate; no code |
| Store → 0.26.3 | The same; "the smoothest of these rounds: follow the `next:` lines and that is it". The guide was refreshed only by a separate `npx hozu skill` (0.26.4 does it in the upgrade) | `package.json` ±13 by migrate; guide +3 / −2; no code |
| Admin → 0.26.4 | `0.26.3 → 0.26.4: upgrade, no source changes`, `done:` one earlier record, guide updated; clean check | `package.json` ±13, guide +3 / −2, `.dockerignore` +4 (the agent files), `Mod+Enter` on three dialog buttons ±3 |
| Store → 0.26.4 | The same; "the cleanest upgrade of the nine rounds" | `package.json` ±13, guide 1 line, `keys: ['/']` on the menu's search field +1 / −1 |

- **The storefront in round 2:** the upgrade was "the best framework upgrade process I have used". Its one complaint,
  a one-line change summary, became bullets in 0.24.
- **The admin in round 2:** it asked migrate to point at code that a new form could replace (for example
  `body:has(` or `session?.`). That was not taken up.
- **The admin in round 5:** the release note pointed at a CHANGELOG that the installed packages did not contain; it
  learnt the changes from the migrate bullets and the guide's topics instead (C9 ships it).
- **Round 6:** the CHANGELOG was in `node_modules/@hozu/cli/CHANGELOG.md`. The store: "the first upgrade with a
  breaking change"; the tool gave the exact line and warned that it is a behaviour change.

## The agents' verdicts (translated)
| | Admin | Storefront |
|---|---|---|
| Round 1 strengths | Diagnostics that come with a fix. `access` that turns into `Forbidden`. `invalidates` that re-reads pages "without one line of refetch". `hozu browse` with actors. Behaviour changes reviewable in the lock: "no mainstream framework offers this" | Diagnostics. Render modes derived from `scope` / `freshness`. No-JS forms. Verification without a server: "the most AI-friendly verification flow I have used". SEO derived from `head` |
| Round 1 weaknesses | "Very limited expressiveness in views", so presentation logic moved into resolvers. Dialogs, flashes, DB lifecycle, a 500 it could not see, CSP docs, no layout | The CLI hanging with a pool. Flash reports that named nothing. No-JS multi-step state. No prefill from server data. One machine per feature |
| Round 1 "again?" | "Yes, with conditions"; it would reserve 20–30 % of the time for framework friction | "Would choose again". For "AI writes, people review" public sites, "the most reassuring framework I have used" |
| Round 2 | "Will choose it": friction "down from 20–30 % to 10–15 %". Go: keep TypeScript "unless a Go service already exists or there is a clear performance need" | 13 of 21 pain points fixed, 4 partly. Retest time "from about an hour to about 15 minutes" |
| Round 3 | Go debugging "close to the 'one process' level"; one regression (the sidebar mark) | "My first choice among similar projects"; "would pick Hozu again without hesitation" |
| Round 4 | `current(route)` is "better overall". **Disagrees:** the framework knows the route hierarchy, yet leaves sections entirely to the app; a missed detail route gets no diagnostic | Explicit sections are "better than 0.23". The release's biggest gain was "`browse` catching my own bug" |
| Round 5 | "Zero hand edits, and the Go contract did not change." 0.25 answered "the main complaint of my last report" (the sidebar's nested ternary); shortcuts and the covering-click message "actually useful". Against: the coverage figures contradict each other, `--select` is harder to read, and "`Mod+s` to save, the most typical back-office shortcut, still cannot be done" | Upgrade "as painless as the earlier versions"; no regressions. The covering-click check "hit the problem squarely". "The remaining pain is all at site level: shortcuts, focus, header state" |
| Still open after round 5 | Sections kept by hand: a new detail route missed in `current()` gets no diagnostic (declined again). A diagnostic for expectable errors. A Go health check at start. Machine dialogs without JS. A global notice | One machine per feature. Parts across features (`productTile` written three times). `app()` reading env. Declarative focus and shortcuts without a machine (answered by 0.26, retested in round 6) |
| Round 6 | `Mod+s` "finally" works on the three editors; the four complaints of round 5 (coverage, `hozu why`, `--select`, the flash) fixed. Against: `--target workers` / `vercel` cannot build the app, and the message "did not tell me what to do". Its plan: Node and Docker, with the Go service in a second container | "The new shortcut design is right": no machine, `aria-keyshortcuts` written, both frictions of round 5 gone, a net 9 lines fewer; no regressions. Against: for "Node plus a traditional database", the most common combination, a failed edge build is "clearly below the level of the rest of the framework". `--target node` with Docker is the right route for this store |
| Round 7 | The deploy messages "go straight at" its round-6 asks; the loopback warning "very practical". Against: "following the official upgrade steps gave a broken combination", and the IR comparison's false alarms "would bury a real behaviour change" | Deploying went "from esbuild errors I could not read to knowing the next step", and Docker worked the first time. "The upgrade itself regressed, and it is the first step of every round": 216 errors at the start of a patch upgrade "hurt confidence more than any one missing feature" |
| Still open after round 6 | Edge deploys for a TCP database (0.26.2 names the chain and the ways out). A global notice (declined a third time) | `app()` reading env, kit components taking data objects, more than one machine per feature (all declined again) |
| Round 8 | Following the official steps needed "no manual rescue"; the round-7 problems "mostly fixed". Against: the mismatch warning came first but 3 449 lines followed, and `by hand:` named something already done | The upgrade "completely normal", the image "clean". What remains is "static checks stricter than the runtime, or hints not precise enough, which do not affect the shop" |
| Round 9 | Upgraded "in one go"; the round-8 items "mostly fixed as promised". Against: the printed fix ran the old CLI | "The cleanest upgrade of the nine rounds"; "for this storefront, Hozu currently has nothing that blocks normal development" |
| Still open after round 7 | A Dockerfile for the Go service and a compose file (its own work). Chains from `app.ts` (declined) | The same three structural asks (declined again); splitting its database migrations from the runtime code (its own work) |

## What changed in Hozu
The trial drove nine releases. Each ADR records every ask with the decision and the reason.
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
- **0.26 ([ADR 0073](../adr/0073-0-26.md) B, C, D; its main subject, one-command deploys, did not come from this
  trial):**
  - `keys` moves from `ui.send` to the element it presses: a field is focused, a button or link is clicked, with no
    machine needed and `aria-keyshortcuts` written by the server;
  - the coverage summary and `hozu why` count a shared `on` once;
  - `--select` prints `class` last and cut; a covering element is named; `--js both` no longer repeats the arrival;
  - the CHANGELOG ships in `@hozu/cli`, and `hozu migrate` prints each step's entry;
  - from the owner's manual test: `hozu serve` signs in on Safari over http, and the guide says why Arc flashes.
- **0.26.2 ([ADR 0075](../adr/0075-0-26-2.md)):**
  - an edge build that cannot work names the chain (`server/db.ts → mysql2 → net, tls`) and the ways out, with the
    code `build`; `hozu build` without `--target` says before the choice which targets can serve the app;
  - a failed build removes its output, so the retry runs;
  - `--target node` lists the `remote()` services to deploy too, keeps their folders out of the image, and names env
    values on a loopback host;
  - `browse` names the dialog over a covered click and says where `press` moved focus; `.vercel/` in the scaffold's
    `.gitignore`.
- **0.26.3 ([ADR 0076](../adr/0076-0-26-3.md)):**
  - `hozu migrate` raises a patch release and removes a record written for another version instead of comparing it;
  - `hozu check` fails first when the CLI and `@hozu/core` differ;
  - deploy messages say what the build does, list kept files and the `.dockerignore` lines they lack, print
    `docker build -f` for `--out`, and leave no empty folder;
  - `press` reports focus on every press, by name, and a key that only hidden controls have.
- **0.26.4 ([ADR 0077](../adr/0077-0-26-4.md)):**
  - `hozu check` stops on a CLI / core mismatch with one error and the fix for the app's state;
  - HZ014 scopes shortcuts per `dialog`, as the runtime does;
  - `hozu migrate` lists what it did under `done:`, removes earlier records and refreshes the guide on an upgrade;
  - `--target node` names the image after `package.json` and leaves agent files out of it; `press` names a key no
    control has.
- **0.26.5 ([ADR 0078](../adr/0078-0-26-5.md)):** the mismatch fix names the CLI version; focus notes name buttons and
  links; JS-off notes say `no control has`; printed paths follow one rule.
- **The lesson recorded in ADR 0071:** accepting an ask as stated can be wrong.
  - 0.22's automatic `aria-current` answered the admin's ask. It misfired on the next-page link, and the narrower rule
    of 0.23 misfired on filtered lists.
  - What a section is belongs to the app. The owner's instruction for 0.24 was to judge asks by the framework, not to
    take them as given.
- **Round 5's lesson (ADR 0073 B):** four asks about one new feature (`Mod+s`, `/` to focus, a machine for every
  shortcut, final states) had one cause: a shortcut is "press this control", not "send this event". One redesign
  answered all four instead of four additions.
- **Round 6's lesson (ADR 0075):** the redesign held on its first retest. The new failure was in the deploys, the one
  0.26 feature this trial did not drive: refusing `mysql2` on an edge target was right, but the message broke
  principle 7 (a diagnostic names its place, cause and fix).
- **Round 7's lesson (ADR 0076):** the release fixed what it set out to fix, and its own upgrade broke. Every
  earlier upgrade crossed a minor; this was the first patch upgrade the agents ran with `hozu migrate`, and no test
  covered it. The upgrade is the first thing a person meets in every release.
- **Rounds 6–9:** four patch releases in a row (0.26.2–0.26.5) corrected the previous one's hints (a fix that did nothing, a list
  under the wrong heading, a path). The tests checked what the tools do, not whether a person can follow what they
  print; before 1.0 the printed fixes need a check of their own.
- **Round 8 (ADR 0077):** the fix held for both agents on their real apps. The one new bug was a static check
  stricter than the runtime (HZ014 and a dialog), the kind a diagnostic must not be.

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
- **Round 8's decisions were retested in round 9;** round 9's are not: 0.26.5 was written after their last run.
- **One deploy:** the storefront ran its `--target node` image on Docker Desktop, on the same machine as the database
  (`host.docker.internal`). Nothing ran on a hosting platform, and the admin with its Go service was not deployed.
  `--target workers` / `vercel` cannot serve either app (MySQL over TCP).
- **Agent verification covers one browser family.** `hozu browse` drives a Chromium-based browser against the
  in-process handler; the Safari sign-in failure and Arc's blank frames surfaced only in the owner's manual test in
  round 5.
- **The managed instructions** of the organisation shaped the form of every report (tables, three next steps), as in
  earlier trials.
