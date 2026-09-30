# Deployment

- **Node:** `npm start` (`node --import @hozu/transform/register serve.ts`). `hozu build` writes `dist/public/`,
  `dist/manifest.json` and `dist/server/render.js`; serve with
  `createServer({ build: buildProject(project, { manifest }), manifest, publicDir: 'dist/public', … })`.
- **Edge (Bun, Deno, Workers, Vercel):** bundle with `hozuTransform()` from `@hozu/transform/esbuild`, then
  `createHandler({ build: buildProject(project, { manifest }), manifest, render, resolvers })` from
  `@hozu/runtime-server`, `export default { fetch: handler.fetch }`, where `render` is `import * as render from
  './dist/server/render.js'`.
- **Static host (GitHub Pages):** `exportStatic({ build, styles, resolvers, outDir })` from `@hozu/adapter-static`
  writes every page without per-request data plus the files they link to, and lists skipped routes.
- Set `SESSION_SECRET` when the app has sessions (production refuses to start without it). The default store keeps
  sessions in memory per process; an edge or multi-instance deployment passes a shared store to `createHandler`.
