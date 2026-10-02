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
  from `@hozu/adapter-static` writes every page without per-request data, and lists skipped routes. With client
  components, also pass `components: await bundleComponents(build)` (`@hozu/bundle`).
- Set `SESSION_SECRET` when the app has sessions (production refuses to start without it). The default store keeps
  sessions in memory per process; an edge or multi-instance deployment passes a shared store as `app({ session })`.
