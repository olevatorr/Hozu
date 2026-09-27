---
title: Data
description: Declare reads, writes and refresh rules independently of their server implementations.
order: 4
---

## Declare a query

A query describes the shape and policy of a read. Its implementation lives on the server.

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
})
```

Register both declarations in the feature. Render the query with `ui.query(listArticles, {}, ...)` and bind its implementation through `resolvers(project, implement => [...])`.

## Choose scope and freshness

| Field | Meaning |
| --- | --- |
| `scope: 'public'` | Data is safe to share between visitors. |
| `scope: 'user'` | Data belongs to a session and cannot enter a shared cache. |
| `freshness: 'static'` | Data can be computed ahead of time. |
| `freshness: { revalidate: 60 }` | Revalidate on the declared interval in seconds. |
| `freshness: { swr: 60 }` | Serve stale content while refreshing according to the policy. |
| `freshness: 'live'` | Receive updates through the framework's live-query transport. |

Session-aware applications declare the session schema on the project. Only user-scoped resolvers receive the session identity.

## Write through mutations

A mutation declares its input, output, possible errors and invalidated tags. It runs when a machine enters a state that invokes it. Cover both successful and failed outcomes with transitions and contracts.

For example, an `addArticle` mutation can declare `invalidates: () => [articlesTag()]`. Hozu owns the refresh of queries carrying that tag, so your UI does not need a second handwritten synchronization mechanism.

Every mutation also has the framework error `Invalid`, with a message and field errors. Schema validation can produce it, or your resolver can call `fail('Invalid', ...)`. Handle it explicitly when you want field-level feedback; otherwise the unexpected-error path handles it.

## Implement the declaration

Import declarations by identity into server code, then bind them:

```ts
import { resolvers } from '@hozu/data'
import project from './hozu.config.ts'
import { listArticles } from './features/articles/model.ts'

export const createResolvers = () => resolvers(project, (implement) => [
  implement(listArticles, () => [{ id: 'hello', title: 'Hello Hozu' }]),
])
```

Replace the in-memory implementation with your database or service without changing the view's data contract. Server-fetched data is serialized into the page payload instead of being fetched again on hydration.

## Load a Markdown collection

`@hozu/content` loads Markdown files into entries with `slug`, validated front matter, HTML and headings. Call `loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema })` in server code, then return the entries through public queries. This website uses that pattern for its documentation and original trial records.
