---
title: Data
description: Declare reads, writes and refresh rules independently of their server implementations.
order: 4
---

## Declare a query

A query describes the shape and policy of a read, and where its implementation runs.

```ts
import { query, tag } from '@hozu/core'
import { z } from 'zod'

export const articlesTag = tag({ param: null })
export const listArticles = query({
  input: z.object({}),
  output: z.array(z.object({ id: z.string(), title: z.string() })),
  scope: 'public',
  freshness: 'static',
  tags: () => [articlesTag()],
  runs: 'server',
})
```

Export both from a module the feature lists in `declarations`. Render the query with `ui.query(listArticles, {}, ...)` and bind its implementation through `resolvers(project, implement => [...])`.

## Choose scope and freshness

| Field | Meaning |
| --- | --- |
| `scope: 'public'` | Data is safe to share between visitors. |
| `scope: 'user'` | Data belongs to a session; it is read per request and never cached. |
| `freshness: 'static'` | Data can be computed ahead of time; tags and invalidations keep it current. |
| `freshness: 'request'` | Read once per request. For public data it makes the page uncacheable. |
| `freshness: { revalidate: 60 }` | Revalidate on the declared interval in seconds. |
| `freshness: { swr: 60 }` | Serve stale content while refreshing according to the policy. |
| `freshness: 'live'` | Read per request, and push updates through the live-query transport. It needs tags. |

User-scoped queries take `'request'` or `'live'`; any other freshness is HZ049. Public data is `'static'` with tags unless it changes without a declared writer.

Session-aware applications declare the session schema on the project. Only user-scoped resolvers receive the session identity.

## Choose where it runs

Every query and mutation declares what its implementation needs. Hozu derives where it runs on each deployment.

| `runs` | The implementation needs | Implemented in |
| --- | --- | --- |
| `'server'` | a database, a server secret, the session | the resolvers in `app.ts` |
| `'browser'` | the visitor's own credentials, such as a token in `localStorage` | the feature's `fetch.ts` |
| `'either'` (default) | nothing special: a public API, or your own API with CORS | the feature's `fetch.ts` |

An `'either'` query is rendered on the server on first paint. Later reads and mutations call the API from the browser directly, never through your server. A `'browser'` query renders its `pending` branch on the server and reads after hydration. `'either'` needs `scope: 'public'`.

```ts
// feature.ts
export const repos = feature({ id: 'repos', intent, declarations: [model, views],
  fetch: new URL('./fetch.ts', import.meta.url) })

// fetch.ts: one export per effect, under its name
import { implement } from '@hozu/core/fetch'
import type * as model from './model.ts'

export const searchRepos = implement<typeof model.searchRepos>(async ({ q }, { fail, signal, env }) => {
  const r = await fetch(`${env.API_URL}/search/repositories?q=${encodeURIComponent(q)}`, { signal })
  return r.ok ? (await r.json()).items : fail('Unavailable', { status: r.status })
})
```

Inputs and outputs are checked against their schemas in the browser too, and `fail` returns a declared error. `env` is the public environment; server secrets and the session never reach `fetch.ts`. The API must allow the page's origin (CORS); otherwise use `runs: 'server'`. The app needs `components: bundleComponents`, which bundles `fetch.ts` for the browser.

## Write through mutations

A mutation declares its input, output, possible errors and invalidated tags. It runs when a machine enters a state that invokes it. Handle both successful and failed outcomes with transitions; a contract is needed only where a transition decides. Query resolvers only read: writes belong in mutation and endpoint resolvers, because a prefetched link runs a page's queries.

For example, an `addArticle` mutation can declare `invalidates: () => [articlesTag()]`. Hozu owns the refresh of queries carrying that tag, so your UI does not need a second handwritten synchronization mechanism.

Endpoints declare `invalidates` the same way; it applies when the endpoint succeeds. A write that happens outside Hozu, such as a job, calls `await server.revalidate([articlesTag()])`, which returns the number of dropped cache entries and pages as `{ entries, pages }`.

Every mutation also has the framework error `Invalid`, with a message and field errors. Schema validation can produce it, or your resolver can call `fail('Invalid', ...)`. Handle it explicitly when you want field-level feedback; otherwise the unexpected-error path handles it.

## Implement the declaration

Import declarations by identity into the app module (`project({ app: new URL('./app.ts', import.meta.url) })`), then bind them:

```ts
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import project from './hozu.config.ts'
import { listArticles } from './features/articles/model.ts'

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(listArticles, () => [{ id: 'hello', title: 'Hello Hozu' }]),
  ]),
})
```

`hozu serve`, `hozu check`, `hozu get`, `hozu browse` and `testApp(app)` all run this one module.

Replace the in-memory implementation with your database or service without changing the view's data contract. Server-fetched data is serialized into the page payload instead of being fetched again on hydration.

## Load a Markdown collection

`@hozu/content` loads Markdown files into entries with `slug`, validated front matter, HTML and headings. Call `loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema })` in server code, then return the entries through public queries. This website uses that pattern for its documentation and original trial records.

## Understand the design

Read [How Hozu works](/how-it-works/framework-owned-data) for the decisions behind this API and their trade-offs.
