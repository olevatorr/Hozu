---
title: Deploying
description: Choose a static host, a Node server or a web-standard runtime.
order: 8
---

## Start from the render plan

Use `hozu plan` to inspect the routes you intend to deploy. Public static pages can be exported. Sessions, mutations and request-time data need a server. An assertion can verify a static plan, but cannot force a dynamic page to become static.

## Static hosting

Use `exportStatic` from `@hozu/adapter-static`, passing the build, compiled styles, resolvers and output directory. The blog's content queries and parameterized entries provide the pattern for content sites; the cart example includes an export script.

```ts
import { exportStatic } from '@hozu/adapter-static'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const build = buildProject(project, { sources: false })
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
  outDir: 'dist',
})
for (const { route, reason } of result.skipped) console.error(route, reason)
if (result.skipped.length) process.exitCode = 1
```

Declare `entries` for every parameterized page and set `site.url` to the production origin. Inspect the output for missing pages before publishing. This website exports to `site/dist`, writes a `CNAME` for `hozu.org`, and includes `.nojekyll` so GitHub Pages serves its underscore-prefixed assets.

Static hosts do not run query resolvers after export. Rebuild the site when content changes. For social metadata, pass `ui.asset(...)` as `head.image`; the export copies the file and the page links it by absolute URL. Generated `ui.og` images require a server handler.

## Node

Run `hozu build` to generate `dist/public`, `dist/manifest.json` and `dist/server/render.js`. The Node adapter bridges HTTP requests to Hozu and serves static assets. Connect `createServer` from `@hozu/adapter-node` to the build and your resolvers; use the generated manifest and `publicDir` for a production build.

The adapter includes an ISR page cache, tag revalidation, CSP and cross-site POST checks. Session-based applications must configure their session identity and a stable production secret. Cache and invalidation state are per instance; account for that when running multiple instances.

## Edge and web-standard runtimes

Use `createHandler` from `@hozu/runtime-server` in a runtime that serves web-standard `Request` and `Response` objects. Build ahead of deployment and supply the generated render module, because the edge runtime cannot generate it at startup.

```ts
import { buildProject } from '@hozu/core/ir'
import { createHandler } from '@hozu/runtime-server'
import manifest from './dist/manifest.json' with { type: 'json' }
import * as render from './dist/server/render.js'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const handler = createHandler({
  build: buildProject(project, { manifest }),
  manifest,
  render,
  resolvers: createResolvers(),
})
export default { fetch: handler.fetch }
```

Serve the generated public assets through the host's static-asset mechanism. Keep resolver dependencies compatible with the chosen runtime.
