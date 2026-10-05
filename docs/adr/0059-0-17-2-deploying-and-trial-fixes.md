# ADR 0059 — 0.17.2: deploying, and what the night's trials found

- **Status:** implemented (owner, 2026-10-05: "全修", and on `hozu export` and shared sessions: "列入0.17.2 … 他不影響
  任何寫法，比較像是之前缺失").
- **Sources:**
  - testing the site's new Deploying recipes on a fresh 0.17.1 app (Docker, static export, `wrangler dev`);
  - trial 0024 B3 and its follow-ups (`bench/trial/longrun/results-0024-b3/README.md`, ADR 0057 B3);
  - the DevTools-request trial (same folder, `requests/`).

Nothing here changes how an app is written. Two additions fill gaps in deploying (H, I); the rest are fixes.

## A — Cloudflare Workers could not start a bundle
- **Problem:** a Worker has no `import.meta.url` (it is `undefined` in workerd). `@hozu/core` computed a URL from it
  at module load (`source/capture.ts`), and so does every app: `new URL('./app.ts', import.meta.url)` in
  `hozu.config.ts`. The bundle threw `Invalid URL string` at startup. The edge test passed because it defined
  `import.meta.url` itself.
- **Options:** document an esbuild `define`; a Workers-only option on the plugin; or have `hozuTransform()` give each
  app file its own URL.
- **Decision:** the plugin replaces `import.meta.url` in app files (not `node_modules`) with that file's `file:` URL,
  which is what Node gives and what the build reads; core tolerates a missing `import.meta.url`. The edge test no
  longer defines it (the `iife` bundle has none, as in workerd), and fails without the fix.
- **Trade-off:** in a bundle, an app file's `import.meta.url` now names its source file, not the bundle. Code that
  reads a file relative to the bundle (a folder copied next to it) reads the source path instead; such reads cannot
  work in a Worker at all, and `hozu serve` runs the sources unbundled. Client component modules are bundled by
  `@hozu/bundle`, which does not use the plugin, so browser code keeps its own `import.meta.url`.

## B — DevTools under-counted a message's places
- **Problem:** a request's `Mind` line says "change it there, in every locale" for a message used once, and "shared
  by N places" otherwise. The count saw view text only, not a page head or an attribute. In the trial, the heading
  `Notes` was also the page `<title>`, and one of two agents changed the tab title as told.
- **Decision:** the count adds element attributes, client component props and page heads that use the message.

## C — `hozu migrate` 0.14 → 0.15 left a reserved name
- **Problem:** `Forbidden` is the framework's access error since 0.15 (reserved, HZ014). An app that declared its own
  `Forbidden` (both trial 0024 apps did) failed `hozu check` after migrating.
- **Decision:** the step renames it to `NotAllowed` where 0.14 code names an error: `errors` / `failed` keys,
  `fail('Forbidden')` and a contract's `error`. 0.14 had no framework `Forbidden`, so each of these is the app's own.
  The old IR is mapped the same way, so migrate still proves the behaviour unchanged. A shorthand key
  (`{ Forbidden }`) becomes `NotAllowed: Forbidden`, so the variable it names stays. A file that already uses
  `NotAllowed` gets a note to check by hand.

## D — a static export under `basePath`
- **Problem:** pages went to `dist/<base>/`, `sitemap.xml` to `dist/`, while `robots.txt` named
  `/<base>/sitemap.xml`. A GitHub project site uploads `dist/<base>`, so its sitemap was lost.
- **Decision:** `sitemap.xml` and `404.html` go under the base; `robots.txt` stays at the root, where crawlers look.

## E — the skill's deploy topic
- Rewritten for what was tested: which host (`hozu export` decides), Docker, Workers (bundle, lazy handler,
  `[assets]`), shared sessions. It no longer lists Vercel as an edge runtime (untested; static hosting on Vercel is).

## F — testing a stale form
- **Problem (B3):** to post a form after its data changed in another tab, an agent started a server and copied the
  form's `__hozu` action out of the HTML with curl. `hozu browse` can already do it: `remember <name> from <selector>
  @action`, then `post $name …` as another actor; the testing topic said so only in its long form.
- **Decision:** one line in the short form, with a selector that picks the right form on a page with several.
  Verified on the trial app (the stale post answers 400 and shows "Archived").

## G — the trial harness killed its own acceptance
- **Problem:** an agent's `pkill -f "hozu serve"` matched every acceptance server, and the acceptance process itself
  (its arguments held `hozu serve`). Five acceptance runs were interrupted across trial 0024 and B3.
- **Decision:** the entry is `@hozu/cli serve` and the server runs as `node …/@hozu/cli/bin/hozu.js serve`, so no
  process of the harness matches `hozu serve`. Checked during a full acceptance run.

## H — `hozu export`
- **Problem:** a static site needed a hand-written `export.ts` (twenty lines and two packages); `hozu build` writes
  files for a server, not pages.
- **Decision:** `hozu export [--out dist]` runs `exportStatic` with the app's resolvers, styles, client bundle and
  images, writes `.nojekyll` (GitHub Pages hides `_` folders otherwise; harmless elsewhere), and exits 1 listing the
  skipped pages and the server effects pages call. It empties its output folder, so it refuses a folder that holds
  the app or the current directory (`--out ..` would have removed the app: found in review) and a non-empty folder
  without the `.nojekyll` an earlier export wrote.
  `create-hozu` adds `@hozu/adapter-static` (no third-party dependencies).
- **Not done:** an `export` script in new apps; `npx hozu export` is the one form.

## I — sessions in a shared store
- **Problem:** `memorySessions()` lives in one process: several instances disagree on who is signed in, and on Workers
  sessions vanish between isolates.
- **Options:** a signed cookie that holds the session (stateless, but sign-out cannot revoke it, against ADR 0043 B);
  adapters per database; or one store over a small key-value interface.
- **Decision:** `kvSessions(kv, { secret, name?, maxAge?, secure?, prefix? })` in `@hozu/runtime-server`, where
  `kv` has Cloudflare KV's shape (`get`, `put(key, value, { expirationTtl })`, `delete`): a KV binding fits as is,
  and Redis or a database is three lines. Same contract as `memorySessions` (opaque signed id in the cookie, value on
  the server, deleted on sign-out, TTL = `maxAge`); the secret is required. `memorySessions` now runs on the same
  code over an in-memory map. Cloudflare KV keeps a value at least 60 seconds, so the stored TTL is at least 60 (the
  cookie still ends at `maxAge`); a value that is not JSON reads as signed out. A Worker passes it to `createHandler(app, { session })`, created on the first request
  when its `env` is known; `app.ts` stays the same everywhere.
- **Limit:** Cloudflare KV is eventually consistent; a sign-out can take up to a minute to reach other regions.
  Durable Objects give strong consistency through the same interface.

## J — types for the render module (found while verifying A and I)
- **Problem:** an edge entry imports `build/server/render.js`, which had no types, so the entry failed `tsc` and
  therefore `hozu check`.
- **Decision:** `hozu build` writes `server/render.d.ts` next to it (`RenderModule['default']`).

## Results
- Each fix has a test that fails without it: edge bundle without `import.meta.url`, message uses with a page head
  (`examples/blog`, `posts.offline` = 2), static export under `/shop`, migrating the 0.10 notes fixture with its own
  `Forbidden` to 0.15 with an equal IR, `hozu export` on `examples/stars` (0 skipped) and `examples/cart` (exit 1),
  and `kvSessions` across two instances.
- **On real workerd (`wrangler dev`, packed 0.17.2 tarballs, a fresh `create-hozu` app with `hozu add feature
  --with auth`):** the bundle starts without a `define`; signing in answers 303 and writes `session:<id>` to the KV
  binding with its expiry; the page reads "Signed in as ada"; signing out deletes the key and the page redirects to
  `/login`. `hozu export` on the same app exits 1 naming the page and the two mutations that need a server, and on
  the app before the feature writes `index.html`, the sitemap and `.nojekyll`.
- Gate green (804 tests with `CHROMIUM_PATH`; P7 8 011 B unchanged).
