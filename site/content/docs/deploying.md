---
title: Deploying
description: Find out whether your app needs a server, then deploy it to a static host, a Docker container or Cloudflare Workers.
order: 15
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

```sh
npx hozu export
```

`hozu export` empties `dist/` and writes one `index.html` per page, the `/_hozu/` assets, `sitemap.xml`, `robots.txt`, the web manifest and `.nojekyll`. It exits with an error, and names each page and effect, when a page needs a server. New apps include `@hozu/adapter-static`, which it uses; in an older app run `npm install @hozu/adapter-static` first. `--out <dir>` writes elsewhere. To export from your own script, call `exportStatic` from `@hozu/adapter-static` with the build, styles and resolvers.

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
      - run: npx hozu export
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

The `.nojekyll` that `hozu export` writes stops GitHub Pages from hiding the underscore-prefixed `/_hozu/` folder. With a custom domain, write a `CNAME` file into `dist/` as well. A project site served under `https://<user>.github.io/<repo>/` needs `project({ http: { basePath: '/<repo>' } })`. The export then writes the pages, the sitemap and `404.html` into `dist/<repo>/`, so upload that folder. This website is deployed this way, from `site/export.ts` and `.github/workflows/pages.yml` in the Hozu repository.

### Cloudflare Pages, Netlify and Vercel

Connect the repository and set:

| Setting | Value |
| --- | --- |
| Build command | `npx hozu export` |
| Output directory | `dist` |
| Node version | 22 or later (for example `NODE_VERSION=22`) |

Set public environment variables in the host's dashboard; the export writes them into the pages.

## Node server

`hozu serve` (the generated `npm start`) runs the app module on adapter-node: no server file to write. It listens on `PORT` (default 3000), compiles styles and serves every `ui.asset` under `/_hozu/a/`. It runs as production unless `NODE_ENV` is set, so an app with a session refuses to start without `SESSION_SECRET`.

### Docker

`npx hozu build --target node` writes this `Dockerfile` and a `.dockerignore` (it keeps yours when they exist), and lists what the server needs: the env your project declares, `SESSION_SECRET`, each service the app reaches through `remote()` (deploy it too; a `.dockerignore` this command writes leaves the service's Go module out of the image when no app code lives in it), and every env value that points at `127.0.0.1` or `localhost`, which inside a container is the container itself.

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

Use a fixed `SESSION_SECRET` from your platform's secrets in production; a new one signs everyone out. One container keeps sessions in memory, so a restart signs everyone out too; with several containers, or to keep sessions across restarts, use `kvSessions` over a shared store (see [Several instances](#several-instances)). The image runs on any container host, such as Fly.io, Railway, Render or Google Cloud Run. Hosts that run Node directly need only `npm ci` and `npm start` with Node 22.18 or later.

### What the Node adapter does

There is no `public/` folder served at the root: a file named in data, such as a cover image in front matter, is served by a GET endpoint with `output: 'response'`. Resolvers, the session store and the client components bundle are named in `app.ts`, headers in `project({ http })`, statuses in `head.failed`.

The adapter includes an ISR page cache, tag revalidation, CSP and cross-site POST checks. It compresses as it streams (gzip, or brotli when only that is accepted), flushing whenever the stream waits, and serves files from the `.br` and `.gz` that `hozu build` writes next to each file over 1 KB in `dist/public`. Private and cookie-setting answers are compressed per request only; live streams, `HEAD`, 204 and 304 answers and already-compressed types are sent as they are.

### Errors in production

With `NODE_ENV=production`, the browser never sees an error's message: an `Unexpected` answer says `Internal error`, with the call id when a Go service failed. `app({ onError })` still receives the full error, so log it there. Development, `hozu get`, `browse` and `call` show the message.

### A Go service beside it

An app whose resolvers run in Go through `remote()` (see [Resolvers in Go](/docs/go)) deploys as two processes: the Hozu server above, and the service.

- Run the service on a private address only the Hozu server reaches: it trusts the session each call carries.
- Read both values from the server environment: `remote({ url: { env: 'NOTES_SERVICE_URL' }, secret: { env: 'NOTES_SERVICE_SECRET' }, … })`. The secret is the same value on both sides and at least 16 characters long (HZ093 otherwise).
- After changing a remote declaration, run `npx hozu gen`, rebuild the service and deploy both together. A service built from an older contract answers 409 to the effects that changed.
- On shutdown, let the service finish the calls in flight; the `main.go` in [Resolvers in Go](/docs/go) does.

## Cloudflare Workers and Vercel

One command writes the folder the platform deploys as it is. Hozu never contacts the platform: its own CLI uploads the folder with your account.

```sh
npm install -D @hozu/bundle
npx hozu build --target workers   # dist/workers: worker.mjs, assets/, wrangler.jsonc
cd dist/workers && npx wrangler deploy

npx hozu build --target vercel    # .vercel/output: an Edge Function and its static files
npx vercel deploy --prebuilt
```

The command also prints what the platform needs from you, read from your declarations: the server env your project declares, `SESSION_SECRET` for an app with sessions, and the session store. For example, on the cart example:

```text
hozu build --target workers → dist/workers
  wrote dist/workers/worker.mjs
  wrote dist/workers/assets/
  wrote dist/workers/wrangler.jsonc
  the platform needs:
    - SESSION_SECRET (32+ characters): signs the session cookie
    - server env: STOCK_LIMIT
    - a KV namespace bound as SESSIONS: npx wrangler kv namespace create SESSIONS, then its id in wrangler.jsonc
next: cd dist/workers && npx wrangler deploy
```

- **One bundle.** The app, its resolvers and the generated render module become one file with no `node:` import. When an import needs Node, the build stops and names the chain from your file, then the ways out:

  ```text
  hozu: Cloudflare Workers has no Node built-ins, and these imports need them:
    server/db.ts → mysql2 → net, tls
    hozu build --target node   # these modules run there as they are
    or read the data through a driver that speaks HTTP (or the platform's own database binding)
    or move those effects to a service with remote()   (hozu docs data --more)
  ```

  A plain `hozu build` already says which targets can serve the app, so you know before choosing one.
- **Static files first.** The client, chunks, styles and assets are served by the platform before the function runs; the function answers pages, queries, effects and endpoints.
- **Sessions.** On Workers the entry uses `kvSessions` over the KV namespace bound as `SESSIONS` (create it, then put its id in `wrangler.jsonc`, and `npx wrangler secret put SESSION_SECRET`). On Vercel every instance needs one store: pass `app({ session: kvSessions(kv, { secret }) })` over a KV you choose. The cookie holds only a signed id. KV can take up to a minute to show a sign-out in other regions.
- **Memory does not last.** A Worker or an Edge Function keeps nothing between requests: keep app data in a database.
- **Check what you upload.** `npx hozu browse / --build dist/workers --do '…'` drives the bundled entry and its static files in Chrome, with the env from your shell; `--session '{"user":"ada"}'` signs in through its KV.

### Other web-standard runtimes

Deno, Bun and other runtimes that serve `Request` / `Response` take the same handler. Build ahead with `hozu build --out build`, bundle an entry with `hozuTransform()` from `@hozu/transform/esbuild` (the Workers target's `worker.mjs` is the model), pass the manifest and render module, and serve `build/public` through the runtime's static files:

```ts
const handler = createHandler(app, { manifest, render, env })
export default { fetch: handler.fetch }
```

Keep resolver dependencies compatible with the runtime: the handler itself imports no `node:*` module.

## Environment

On a host, set the variables in the platform. `hozu serve` also reads the files listed in `env.files`; an edge handler reads none, so pass `env` to `createHandler`. A static export writes public values into the pages when you export. [Environment](/docs/environment) has the details.

## Security headers
Every response carries a strict Content-Security-Policy, `nosniff`, and a check that refuses cross-site POSTs. Add sources with `app({ csp: { img: ['https://picsum.photos', 'https://fastly.picsum.photos'] } })`; the keys are `script`, `style`, `img`, `font`, `connect`, `frame` and `media`. An image CDN that redirects needs both hosts.

## Several instances

Each instance keeps its own bounded caches: at most 10,000 query results and 5,000 pages by default (`app({ dataCache: memoryDataCache({ maxEntries }) })`, `app({ cache: memoryCache({ maxPages }) })`; `server.stats()` reports the sizes). When several instances serve one app, a mutation on one must tell the others. Give every instance the same bus:

```ts
import { app, httpBus } from '@hozu/runtime-server'

export default app({
  resolvers,
  bus: httpBus({ peers: ['http://10.0.0.2:3000', 'http://10.0.0.3:3000'], secret: process.env.BUS_SECRET! }),
})
```

`httpBus` sends a signed `POST /_hozu/invalidate` to each peer, so the others drop the same pages and data and push to their own live clients. Messages carry tags, never data. With a broker instead of fixed addresses, implement `InvalidationBus` (`publish(tags)`, `subscribe(onTags)`) over Redis, NATS or Postgres `LISTEN`. `app({ staticTtl: 300 })` re-reads `'static'` data after 300 seconds in case a message is lost. Sessions need a shared store too, since the default `memorySessions()` lives in one process: `app({ session: kvSessions(kv, { secret }) })` takes any store with `get`, `put(key, value, { expirationTtl })` and `delete` (Workers KV as it is; Redis wrapped in those three).

## Understand the design

Read [How Hozu works](/how-it-works/derived-rendering) for the decisions behind this API and their trade-offs.
