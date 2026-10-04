# Deployment

- **One app module:** `project({ app: new URL('./app.ts', import.meta.url) })`; `app.ts` default-exports
  `app({ resolvers, session?, components?, … })` from `@hozu/runtime-server`. `hozu serve`, `hozu check`, `hozu get`,
  `hozu browse` and `testApp(app)` all run it, so what the tools verify is what production serves.
- **Node:** `npm start` is `hozu serve` (adapter-node on `PORT`, `HOST`). `hozu build` writes `dist/`.
- Set `SESSION_SECRET` when the app has sessions: `npm start` (`hozu serve`) runs as production unless `NODE_ENV` is set, and production refuses to start without it. `hozu dev`, `get`, `browse` and `call` do not need it.
- Edge (Bun, Deno, Workers, Vercel), static hosts, several instances, upgrading: see --more.

<!-- more -->

## Details
- **App options:** `app({ resolvers: resolvers(project, (implement) => [...]), session?, components?, og?, csp?,
  onError?, preview? })`. There is no wrapper position: headers go through `project({ http })`, statuses through
  `head.failed` and endpoint `failed`, the language through the URL.
- **Node:** adapter-node serves `process.env`, styles and every `ui.asset` (hashed under `/_hozu/a/`). There is no
  `public/` folder served at the root: a file the page shows is a `ui.asset(new URL(...))`; a file named in data
  (a cover in front matter) is served by a GET endpoint with `output: 'response'`. `hozu build` writes
  `dist/public/`, `dist/manifest.json` and `dist/server/render.js`.
- **Edge (Bun, Deno, Workers, Vercel):** bundle with `hozuTransform()` from `@hozu/transform/esbuild`, then
  `createHandler(app, { manifest, render, env })` from `@hozu/runtime-server` and
  `export default { fetch: handler.fetch }`, where `render` is `import * as render from './dist/server/render.js'`.
- **Static host (GitHub Pages):** `exportStatic({ build, styles, resolvers: appOptionsOf(app).resolvers, outDir })`
  from `@hozu/adapter-static` writes every page without per-request server data, and lists skipped routes. With
  client components or fetch.ts, also pass `components: await bundleComponents(build)` (`@hozu/bundle`). Pages whose
  data runs in the browser (`runs: 'browser'` / `'either'`) export completely; `result.needsServer` lists the server
  effects a written page would still call, which a static host cannot answer (HZ082).
- **Edge and fetch.ts:** a host without `import()` of files passes `createHandler(app, { fetches: async (f) =>
  modules[f] })` for `runs: 'either'` effects.
- **Sessions:** the default store keeps sessions in memory per process; an edge or multi-instance deployment passes
  a shared store as `app({ session })`.

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
`npx hozu migrate` again, which checks the IR is unchanged and runs `hozu check`. Never raise `@hozu/*` by hand.
