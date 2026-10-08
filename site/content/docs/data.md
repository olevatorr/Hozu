---
title: Data
description: Declare reads, writes and refresh rules independently of their server implementations.
order: 7
---

## First: whose data is it?

Decide where data lives before declaring it. When the request does not say, ask the person.

| Whose data | Where it lives |
| --- | --- |
| The visitor's own, no sign-in (a watchlist, settings) | The browser: `runs: 'browser'`, `scope: 'user'`, `localStorage` in `fetch.ts` |
| A user's, across devices | The server, with a session and your database |
| Everyone's (posts, comments) | The server, with your database and a deliberate `access` |
| A public third-party API | `runs: 'either'` |

The examples keep data in a module-level array named `demo…`. That is a stand-in: every visitor shares it and a restart loses it.

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
| `freshness: { poll: 30 }` | Read again every 30 seconds (5 to 86400) while a page shows it: data that changes outside your app, such as quotes. Hidden pages and in-flight effects skip a round; public data is cached on the server for half the interval. |

User-scoped queries take `'request'`, `'live'` or `{ poll }`; any other freshness is HZ049. Public data is `'static'` with tags unless it changes without a declared writer.

Session-aware applications declare the session schema on the project. Only user-scoped resolvers receive the session identity.

## Say who may run it

Every server-run `scope: 'user'` query and every server-run mutation declares `access`, like `runs`. A missing `access` is a type error, and HZ088 in untyped code, so reading another visitor's data cannot be written by accident.

| `access` | Who may run it |
| --- | --- |
| `'signedIn'` | Any signed-in visitor. The resolver reads that visitor's data by `session`. |
| `{ owner: { row: (n) => n.owner, session: (s) => s.user } }` | On a query, the framework checks the output: one row that is not the visitor's is `Forbidden`, and a list holding such rows is HZ091 in development (the resolver read too much), dropped and logged once in production. |
| `{ owner: { load: getNote, input: (i) => ({ id: i.id }), row: …, session: … } }` | On a mutation, the framework reads the row with `load` and checks it before the resolver runs. If `load` fails for any reason (a declared `NotFound` or an unexpected error), the answer is `Forbidden` and the resolver does not run, so a caller cannot tell a missing row from someone else's. An owner missing on either side never matches. |
| `{ allow: ({ session, input }) => session.role === 'admin' }` | A condition on the session and the input. |
| `'anyone'` | No condition: sign-in, a newsletter. On user data it is HZ090. |

A refusal is the framework error `Forbidden`, before the resolver runs. It is optional in `failed`, like `Invalid`. A page whose head query is refused answers 403, or maps it: `failed: { Forbidden: login }`. Access is recorded in `hozu.lock.json`, so a change to it is reviewed like a transition. Check it as two visitors in one chain: `hozu browse / --as ada --session '{"user":"ada"}' --do 'remember note from li a @href' --as bob --session '{"user":"bob"}' --do 'goto $note'`.

## Choose where it runs

Every query and mutation declares what its implementation needs. Hozu derives where it runs on each deployment.

| `runs` | The implementation needs | Implemented in |
| --- | --- | --- |
| `'server'` | a database, a server secret, the session | the resolvers in `app.ts` |
| `'browser'` | the visitor's own credentials, such as a token in `localStorage` | the feature's `fetch.ts` |
| `'either'` | nothing special: a public API, or your own API with CORS | the feature's `fetch.ts` |

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

Inputs and outputs are checked against their schemas in the browser too, and `fail` returns a declared error. `env` is the public environment; server secrets and the session never reach `fetch.ts`. The API must allow the page's origin (CORS); otherwise use `runs: 'server'`. List the other origins `fetch.ts` calls in `feature({ connect: ['https://api.github.com', { env: 'POSTS_API' }] })`: Hozu adds them to the page's CSP `connect-src`, which otherwise allows only the page's own origin. An absolute URL, or a public env URL read as `env.NAME`, that `connect` does not list is HZ083. See [Environment](/docs/environment) for API URLs that differ between the browser and the server. The app needs `components: bundleComponents`, which bundles `fetch.ts` for the browser.

## Write through mutations

A mutation declares its input, output, possible errors and invalidated tags. It runs when a machine enters a state that invokes it. Handle both successful and failed outcomes with transitions; a contract is needed only where a transition decides. Query resolvers only read: writes belong in mutation and endpoint resolvers, because a prefetched link runs a page's queries.

For example, an `addArticle` mutation can declare `invalidates: () => [articlesTag()]`. Hozu owns the refresh of queries carrying that tag, so your UI does not need a second handwritten synchronization mechanism. To read data again without writing (a Refresh button, a timer the visitor can pause), a machine transition declares `refresh: () => [articlesTag()]`.

Endpoints declare `invalidates` the same way; it applies when the endpoint succeeds. A write that happens outside Hozu, such as a job, calls `await server.revalidate([articlesTag()])`, which returns the number of dropped cache entries and pages as `{ entries, pages }`.

Every mutation also has the framework error `Invalid`, with a message and field errors. Schema validation can produce it, or your resolver can call `fail('Invalid', ...)`. Handle it explicitly when you want field-level feedback ([Forms](/docs/forms) shows how); otherwise the unexpected-error path handles it.

A machine state can also `invoke` a query, to read data once a person asks for it, such as a preview loaded on a click. Its result and its declared errors arrive in `done` and `failed`, as a mutation's do. Data a page shows from the start belongs in `ui.query` or a view's `seed` instead.

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

Replace the stand-in implementation with your database or service without changing the view's data contract. Server-fetched data is serialized into the page payload instead of being fetched again on hydration.

## Resolvers in another language

When the person asks for it, or a Go service already exists, `remote()` from `@hozu/data` sends server effects to that service over HTTP:

```ts
...remote(
  {
    url: { env: 'NOTES_SERVICE_URL' },
    secret: { env: 'NOTES_SERVICE_SECRET' },
    contract: new URL('./service/hozu/contract.go', import.meta.url),
  },
  [listNotes, addNote],
),
```

`npx hozu gen` writes the Go contract (types, a `Resolvers` interface and the HTTP handler), and `hozu check` reports HZ093 when the contract is older than the declarations. Each effect has its own fingerprint, so after a change only that effect answers 409 until you regenerate. Access, caching, tags and the output check stay in the Hozu server. The secret is required and at least 16 characters long, every call carries an `x-hozu-call` id that the service's log names, and `examples/notes-go` is the reference app. [Resolvers in Go](/docs/go) has the whole loop.

## Keep a session valid while reading

Queries only read, so a query cannot store a renewed token in the session. When the session holds a token that expires, renew it in the app module instead:

```ts
export default app({
  resolvers,
  refreshSession: async (session, { env }) =>
    session.expires > Date.now() ? undefined : { ...session, ...(await renew(session.refreshToken, env)) },
})
```

`refreshSession` runs once per request, when the request first reads the session and before any resolver sees it, so the page, its queries and its mutations all get the renewed value. Return the new session (it replaces the old one on the server; the cookie stays the same), `null` to sign out, or `undefined` to keep it. Within one server process, the requests of one session that arrive together, or in the ten seconds after a renewal, share one call, so a single-use refresh token is spent once there; with several instances, renew where the token endpoint tolerates a second use. A session signed out while the hook runs stays signed out. A hook that throws keeps the session and reports through `onError`. The value is checked against the session schema. Keep tokens in the session rather than in module variables: those are lost on a restart and differ between instances.

## Use a database
- Create one pool per process in `app.ts` and close it in `app({ dispose: () => pool.end() })`, so one-shot commands such as `hozu get` exit and `hozu serve` stops cleanly. A transaction lives in one mutation resolver.
- Keep migrations and seed data as idempotent scripts in `package.json`; read the connection URL from the server env.
- Route params and form fields arrive as strings: declare numeric ids with `z.coerce.number()`. A query input that fails its schema is reported to `onError` with the field, since the app built it.
- Data the whole staff shares but only staff may read is `scope: 'user'` with `access`. Share a rule between effects with `part()`: `const staffOnly = part(({ session }) => session.role !== 'editor')`, then `access: { allow: staffOnly }`.
- A resolver may answer `fail('Forbidden', { message })`. With any access but `'anyone'` its `session` is typed as present.
- Declare the failures you can expect (a row that is gone, a state that forbids the change) as errors of the effect and handle them in `failed`: they render the same with and without JavaScript. A thrown error is `Unexpected`, a server fault: a native post answers 500, and production shows `Internal error`.
- When another app writes the same database, give this app a signed endpoint that `invalidates` the affected tags and call it after each write. Every query those writes change needs a tag; one without tags refreshes only on its freshness time.

## Load a Markdown collection

`@hozu/content` loads Markdown files into entries with `slug`, validated front matter, HTML and headings. Call `loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema })` in server code, then return the entries through public queries. This website uses that pattern for its documentation and original trial records.

## Understand the design

Read [How Hozu works](/how-it-works/framework-owned-data) for the decisions behind this API and their trade-offs.
