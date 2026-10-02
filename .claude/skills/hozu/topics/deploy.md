# Deployment

- **One app module:** `project({ app: new URL('./app.ts', import.meta.url) })`, and `app.ts` default-exports
  `app({ resolvers: resolvers(project, (implement) => [...]), session?, components?, og?, csp?, onError?, preview? })`
  from `@hozu/runtime-server`. `hozu serve`, `hozu check`, `hozu get`, `hozu browse` and `testApp(app)` all run this
  module, so what the tools verify is what production serves. There is no wrapper position: headers go through
  `project({ http })`, statuses through `head.failed` and endpoint `failed`, the language through the URL.
- **Node:** `npm start` is `hozu serve`: adapter-node on `PORT` (and `HOST`), `process.env`, styles, images and
  `public/`. `hozu build` writes `dist/public/`, `dist/manifest.json` and `dist/server/render.js`.
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
- Set `SESSION_SECRET` when the app has sessions (production refuses to start without it). The default store keeps
  sessions in memory per process; an edge or multi-instance deployment passes a shared store as `app({ session })`.

## Upgrading Hozu
`npx -p @hozu/cli@latest hozu migrate` (preview with `--dry-run`), then run the `next:` lines it prints: install, and
`npx hozu migrate` again, which checks the IR is unchanged and runs `hozu check`. Never raise `@hozu/*` by hand.
