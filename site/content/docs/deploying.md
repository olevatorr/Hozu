---
title: Deploying
description: Find out whether your app needs a server, then deploy it to a static host, a Docker container or Cloudflare Workers.
order: 9
---

## Does my app need a server?

You do not mark pages as static or dynamic. Hozu derives each page's rendering from what it reads: query `scope`, `freshness` and `runs`, and whether the project declares a session. The choice that remains is where to host the result, and Hozu tells you which kinds of host can run it:

| Your app | Host it on |
| --- | --- |
| Public pages whose data is known at build time, or read in the browser (`runs: 'browser'` / `'either'`) | Any static host: GitHub Pages, Cloudflare Pages, Netlify, Vercel |
| Sessions, user data, or effects with `runs: 'server'` | A Node server (Docker, or any host that runs `npm start`) |
| The same, at the edge | Cloudflare Workers, or another web-standard runtime |

To check, run `hozu plan` for the routes you care about, or try the static export below: it lists every page it could not write (`skipped`) and every server effect a written page would still call (`needsServer`). When both lists are empty, a static host is enough. A `render: 'static'` assertion verifies a plan; it never forces a dynamic page to be static.

## Static hosting

Add the static adapter and the component bundler, then an export script next to `app.ts`:

```sh
npm install @hozu/adapter-static @hozu/bundle
```

```ts
// export.ts
import { exportStatic } from '@hozu/adapter-static'
import { bundleComponents } from '@hozu/bundle'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { appOptionsOf } from '@hozu/runtime-server'
import app from './app.ts'
import project from './hozu.config.ts'

const build = buildProject(project, { sources: false })
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  components: await bundleComponents(build),
  resolvers: appOptionsOf(app)!.resolvers,
  outDir: 'dist',
  env: process.env,
})
for (const { route, reason } of result.skipped) console.error(route, reason)
for (const { path, effect, reason } of result.needsServer) console.error(path, effect, reason)
if (result.skipped.length || result.needsServer.length) process.exitCode = 1
```

```json
"scripts": {
  "export": "node --import @hozu/transform/register export.ts"
}
```

`npm run export` writes `dist/`: one `index.html` per page, `/_hozu/` assets, `sitemap.xml`, `robots.txt` and the web manifest. It exits with an error when a page needs a server.

- Declare `entries` for every parameterized page, so the export knows which URLs to write.
- Set `site.url` to the production origin, or to `{ env: 'SITE_URL' }` to read it from a declared variable (HZ085). Canonical links, the sitemap and share images use it.
- Browser-run queries render their `pending` branch and read after hydration, with the public environment written into the page. So do `'either'` queries whose data cannot be cached at export time. `examples/stars` is a complete app of this kind.
- Static hosts run no resolvers after the export: rebuild when content changes. Pass `ui.asset(...)` as `head.image` for share images; generated `ui.og` images need a server.

### GitHub Pages

In the repository's **Settings → Pages**, set the source to **GitHub Actions**, then add this workflow:

```yaml
# .github/workflows/pages.yml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run export
      - run: touch dist/.nojekyll
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

`.nojekyll` stops GitHub Pages from hiding the underscore-prefixed `/_hozu/` folder. With a custom domain, write a `CNAME` file into `dist/` as well. A project site served under `https://<user>.github.io/<repo>/` needs `project({ http: { basePath: '/<repo>' } })`. The export then writes the pages into `dist/<repo>/`, so upload that folder. This website is deployed this way, from `site/export.ts` and `.github/workflows/pages.yml` in the Hozu repository.

### Cloudflare Pages, Netlify and Vercel

Connect the repository and set:

| Setting | Value |
| --- | --- |
| Build command | `npm run export` |
| Output directory | `dist` |
| Node version | 22 or later (for example `NODE_VERSION=22`) |

Set public environment variables in the host's dashboard; the export writes them into the pages.

## Node server

`hozu serve` (the generated `npm start`) runs the app module on adapter-node: no server file to write. It listens on `PORT` (default 3000), compiles styles and serves every `ui.asset` under `/_hozu/a/`. It runs as production unless `NODE_ENV` is set, so an app with a session refuses to start without `SESSION_SECRET`.

### Docker

```dockerfile
# Dockerfile
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npx", "hozu", "serve"]
```

```text
# .dockerignore
node_modules
.hozu
dist
.env*
```

```sh
docker build -t my-app .
docker run -p 3000:3000 -e SESSION_SECRET="$(openssl rand -hex 32)" my-app
```

Use a fixed `SESSION_SECRET` from your platform's secrets in production; a new one signs everyone out. The image runs on any container host, such as Fly.io, Railway, Render or Google Cloud Run. Hosts that run Node directly need only `npm ci` and `npm start` with Node 22.18 or later.

### What the Node adapter does

There is no `public/` folder served at the root: a file named in data, such as a cover image in front matter, is served by a GET endpoint with `output: 'response'`. Resolvers, the session store and the client components bundle are named in `app.ts`, headers in `project({ http })`, statuses in `head.failed`.

The adapter includes an ISR page cache, tag revalidation, CSP and cross-site POST checks. It compresses as it streams (gzip, or brotli when only that is accepted), flushing whenever the stream waits, and serves files from the `.br` and `.gz` that `hozu build` writes next to each file over 1 KB in `dist/public`. Private and cookie-setting answers are compressed per request only; live streams, `HEAD`, 204 and 304 answers and already-compressed types are sent as they are.

## Cloudflare Workers

A Worker runs the web-standard handler, `createHandler` from `@hozu/runtime-server`. The edge cannot generate the render module at startup, so build first and bundle the result:

```sh
npm install -D esbuild wrangler
npx hozu build --out build
```

```ts
// worker.ts
import { createHandler, type Handler } from '@hozu/runtime-server'
import app from './app.ts'
import manifest from './build/manifest.json' with { type: 'json' }
import * as render from './build/server/render.js'

let handler: Handler | undefined

export default {
  fetch(request: Request, env: Record<string, string | undefined>) {
    handler ??= createHandler(app, { manifest, render, env })
    return handler.fetch(request)
  },
}
```

```js
// bundle.mjs
import { build } from 'esbuild'
import { hozuTransform } from '@hozu/transform/esbuild'

await build({
  entryPoints: ['worker.ts'],
  outfile: 'build/worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['workerd', 'worker', 'browser'],
  plugins: [hozuTransform()],
  define: { 'import.meta.url': JSON.stringify('file:///worker.js') },
})
```

```toml
# wrangler.toml
name = "my-app"
main = "build/worker.js"
compatibility_date = "2026-09-01"

[assets]
directory = "build/public"
```

```sh
npx hozu build --out build && node bundle.mjs
npx wrangler dev      # local
npx wrangler deploy   # your Cloudflare account
```

- `hozuTransform()` lowers views and machines as `hozu serve` does; without it the handler refuses to start (HZ044). In 0.17.1, the `define` line is needed because a bundled Worker has no `import.meta.url`.
- `[assets]` serves `build/public` (the client, chunks, styles and assets) before the Worker runs. The Worker answers pages, queries, effects and endpoints. Compression is left to Cloudflare.
- Environment variables and secrets come from `wrangler.toml` `[vars]` and `wrangler secret put`; the Worker passes them to the handler on the first request.
- A Worker's memory is not shared and does not last: the default `memorySessions()` and data kept in resolver variables are lost between isolates. Keep app data in a database (D1, KV or an external one). An app with sessions needs a `session` store in `app({ session })` that implements `SessionStore` (`read`, `write`, `issue`) over KV or a Durable Object.

### Other web-standard runtimes

Deno, Bun and other runtimes that serve `Request` / `Response` take the same handler. Build ahead, bundle with `hozuTransform()`, pass the manifest and render module, and serve `build/public` through the runtime's static files:

```ts
const handler = createHandler(app, { manifest, render, env })
export default { fetch: handler.fetch }
```

Keep resolver dependencies compatible with the runtime: the handler itself imports no `node:*` module.

## Environment

On a host, set the variables in the platform. `hozu serve` also reads the files listed in `env.files`; an edge handler reads none, so pass `env` to `createHandler`. A static export writes public values into the pages when you export. [Environment](/docs/environment) has the details.

## Several instances

Each instance keeps its own bounded caches: at most 10,000 query results and 5,000 pages by default (`app({ dataCache: memoryDataCache({ maxEntries }) })`, `app({ cache: memoryCache({ maxPages }) })`; `server.stats()` reports the sizes). When several instances serve one app, a mutation on one must tell the others. Give every instance the same bus:

```ts
import { app, httpBus } from '@hozu/runtime-server'

export default app({
  resolvers,
  bus: httpBus({ peers: ['http://10.0.0.2:3000', 'http://10.0.0.3:3000'], secret: process.env.BUS_SECRET! }),
})
```

`httpBus` sends a signed `POST /_hozu/invalidate` to each peer, so the others drop the same pages and data and push to their own live clients. Messages carry tags, never data. With a broker instead of fixed addresses, implement `InvalidationBus` (`publish(tags)`, `subscribe(onTags)`) over Redis, NATS or Postgres `LISTEN`. `app({ staticTtl: 300 })` re-reads `'static'` data after 300 seconds in case a message is lost. Sessions need a shared store too: the default `memorySessions()` lives in one process.

## Understand the design

Read [How Hozu works](/how-it-works/derived-rendering) for the decisions behind this API and their trade-offs.
