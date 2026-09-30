---
title: Routing
description: Declare route identities, connect pages and enumerate static URLs.
order: 5
---

## Declare the URL shape

Routes are explicit declarations, independent of filenames:

```ts
import { route } from '@hozu/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null, search: null })
export const article = route({
  path: '/articles/:slug',
  params: z.object({ slug: z.string() }),
  search: null,
})
```

Register these in `project({ routes })`. A view bound to `article` receives the typed `params.slug` reference.

## Link by identity

Use `ui.a({ href: ui.link(article, { slug: 'hello' }) }, ['Hello'])`. Internal path strings such as `'/articles/hello'` are rejected in views because they bypass the route declaration. External URLs remain ordinary strings.

A machine transition can navigate with `navigate: result => ui.link(article, { slug: result.slug })`. Its contract includes the expected navigation URL.

## Connect a page

`ui.page(article, { views, head, entries })` associates a route with views and metadata. A head query loads the article; its `NotFound` failure produces a 404 status. Render its title and description in `head.render`.

Parameterized static pages also need `entries`, for example:

```ts
entries: {
  query: listArticles,
  input: {},
  params: (item) => ({ slug: item.slug }),
}
```

The exporter and sitemap now know which concrete URLs exist. A route pattern alone cannot enumerate them.

## Search and optional segments

Search schemas contain flat scalar values with defaults or nullable values. Use `ui.link(route, params, search)` to generate canonical query strings. Put shareable filters in the URL instead of a machine's private context.

Route modifiers support optional segments (`:slug?`, nullable string), one or more segments (`:path+`, string array), and zero or more segments (`:path*`, string array). The schema must match the modifier.

## Missing pages and redirects

Declare a static error route and pass it as `project({ notFound })`. Hozu uses its page for unmatched URLs. `project({ error })` supplies a server-error page. When a page's head query declares errors, `head.failed` maps each one to a route without params (a 303 redirect) or to 403, 404 or 410, for example `failed: { Unauthorized: login, Forbidden: 403 }`.

Project HTTP options can declare a base path, a trailing-slash policy, explicit redirects and per-route headers. These are server behaviours; a static host must provide any HTTP rules it needs. Hozu does not provide arbitrary rewrites.

## Understand the design

Read [How Hozu works](/how-it-works/derived-rendering) for the decisions behind this API and their trade-offs.
