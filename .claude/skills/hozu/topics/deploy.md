# Deployment

- **One app module:** `project({ app: new URL('./app.ts', import.meta.url) })`; `app.ts` default-exports
  `app({ resolvers, session?, components?, … })` from `@hozu/runtime-server`. `hozu serve`, `hozu check`, `hozu get`,
  `hozu browse` and `testApp(app)` all run it, so what the tools verify is what production serves.
- **Which host:** nobody marks pages static. `npx hozu export` writes every page for a static host (GitHub Pages,
  Netlify, Cloudflare Pages) to `dist/` and exits 1 naming each page or effect that needs a server; then
  `npx hozu build --target node | workers | vercel` writes what that platform deploys as is and lists what it needs.
- **Node:** `npm start` is `hozu serve` (`PORT`, `HOST`); `--target node` writes its `Dockerfile`.
- Set `SESSION_SECRET` when the app has sessions: `npm start` (`hozu serve`) runs as production unless `NODE_ENV` is set, and production refuses to start without it. `hozu dev`, `get`, `browse` and `call` do not need it.
- Workers, several instances, sessions in KV, upgrading: see --more.

<!-- more -->

## Details
- **App options:** `app({ resolvers: resolvers(project, (implement) => [...]), session?, components?, og?, csp?,
  onError?, preview?, refreshSession?, dispose?, dataCache?, cache?, bus?, staticTtl? })` (`refreshSession`:
  `hozu docs auth`; `dispose` closes a database pool; the caches and `bus`: below). There is no wrapper position: headers go through `project({ http })`, statuses through
  `head.failed` and endpoint `failed`, the language through the URL.
- **Node:** adapter-node serves `process.env`, styles and every `ui.asset` (hashed under `/_hozu/a/`). There is no
  `public/` folder served at the root: a file the page shows is a `ui.asset(new URL(...))`; a file named in data
  (a cover in front matter) is served by a GET endpoint with `output: 'response'`. `hozu build` writes
  `dist/public/`, `dist/manifest.json` and `dist/server/render.js`. It compresses answers as they stream (gzip),
  and framework files with brotli or gzip from the `.br` / `.gz` that `hozu build` writes. Live streams are not
  compressed. The edge handler leaves compression to the platform.
- **Workers and Vercel:** `npx hozu build --target workers` writes `dist/workers/` (`worker.mjs`, `assets/`,
  `wrangler.jsonc`; then `npx wrangler deploy` there); `--target vercel` writes `.vercel/output/` (an Edge Function;
  then `npx vercel deploy --prebuilt`). Both need `@hozu/bundle` and bundle the app with its resolvers. A resolver
  whose imports need Node (a MySQL or Postgres driver over TCP, `node:fs`) stops the build with the chain
  (`server/db.ts → mysql2 → net, tls`) and the ways out: `--target node`, a driver over HTTP, or `remote()`; plain
  `hozu build` already says which targets can serve the app. They print what the platform needs: env, `SESSION_SECRET`, a KV
  namespace bound as `SESSIONS` on Workers, a shared session store on Vercel. Workers keep no memory between
  requests: data goes in a database. Check the bundle before deploying: `npx hozu browse / --build dist/workers`
  (env from your shell; `--session` signs in through its KV).
- **Another edge (Bun, Deno):** `hozu build --out build`, then an entry that calls
  `createHandler(app, { manifest, render, env })` with `import * as render from './build/server/render.js'`,
  bundled with `hozuTransform()` from `@hozu/transform/esbuild` (the target's entry is the model).
- **Static host:** `npx hozu export [--out dist]` (`@hozu/adapter-static`, in new apps) empties the folder, writes
  every page without per-request server data plus `.nojekyll`, and prints what it skipped. Pages whose data runs in
  the browser (`runs: 'browser'` / `'either'`) export completely; a page that calls a server effect is listed
  (HZ082). A GitHub project site sets `project({ http: { basePath: '/<repo>' } })` and uploads `dist/<repo>`.
  In code: `exportStatic({ build, styles, resolvers, outDir })`.
- **Edge and fetch.ts:** a host without `import()` of files passes `createHandler(app, { fetches: async (f) =>
  modules[f] })` for `runs: 'either'` effects.
- **Sessions:** the default store keeps sessions in memory per process. Several instances or Workers share
  `kvSessions(kv, { secret })` (`@hozu/runtime-server`; `kv` has Cloudflare KV's `get` / `put(key, value,
  { expirationTtl })` / `delete`, so a KV binding fits as is; wrap Redis in those three). On Workers pass it to the
  handler: `createHandler(app, { manifest, render, env, session: kvSessions(env.SESSIONS, { secret:
  env.SESSION_SECRET }) })`. Cloudflare KV may take up to a minute to show a sign-out in other regions.
- **Another store:** implement `SessionStore` (`read`, `write`, `issue`) and pass it as `app({ session })` or the
  handler's `session`; keep the cookie an opaque signed id (ADR 0043 B). With `app({ refreshSession })` it also
  needs `update(request, value)`: replace the value under the request's id, keep the id, and say whether it did.

## Caches and many instances
- **Bounded caches:** public query results and cached pages are LRU caches, at most 10,000 entries and 5,000 pages
  per process. Change the bounds with `app({ dataCache: memoryDataCache({ maxEntries }) })` (`@hozu/data`) and
  `app({ cache: memoryCache({ maxPages }) })` (`@hozu/runtime-server`). `server.stats()` reports
  `{ dataEntries, pages, evictions }`.
- **More than one instance:** each instance caches on its own, so a mutation on one must tell the others. Pass
  `app({ bus: httpBus({ peers: [every instance's base URL, this one included], secret: process.env.BUS_SECRET }) })`
  (`@hozu/runtime-server`; signed `POST /_hozu/invalidate`, 32+ character secret). The others drop the tagged pages
  and data and push to their live clients. Messages carry tags, never data.
- **A broker instead of peer URLs:** implement `InvalidationBus` (`publish(tags)`, `subscribe(onTags)`):
  ```ts
  const pub = createClient({ url }); const sub = pub.duplicate()   // e.g. redis
  await Promise.all([pub.connect(), sub.connect()])
  const bus: InvalidationBus = {
    publish: (tags) => void pub.publish('hozu', JSON.stringify(tags)),
    subscribe: (onTags) => {
      void sub.subscribe('hozu', (m) => onTags(JSON.parse(m)))
      return () => void sub.unsubscribe('hozu')
    },
  }
  ```
- `app({ staticTtl: 300 })` re-reads `'static'` data and pages after 300 s, in case a bus message is lost; off by
  default.

## Upgrading Hozu
`npx -p @hozu/cli@latest hozu migrate` (preview with `--dry-run`), then run the `next:` lines it prints: install, and
`npx hozu migrate` again, which checks the IR is unchanged and runs `hozu check` (a patch release: install, then
`npx hozu check`). Never raise `@hozu/*` by hand.
Each release's notes are in `node_modules/@hozu/cli/CHANGELOG.md`.
