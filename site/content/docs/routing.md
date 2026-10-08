---
title: Routing
description: Declare route identities, connect pages and enumerate static URLs.
order: 6
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

`ui.page(article, { views, head, entries })` associates a route with views and metadata. A head query loads the article, and `head.failed` maps each of its declared errors to what the page answers: `failed: { NotFound: 404 }` (a route without params, `403`, `404` or `410`; HZ051). Render its title and description in `head.render`.

Parameterized static pages also need `entries`, for example:

```ts
entries: {
  query: listArticles,
  input: {},
  params: (item) => ({ slug: item.slug }),
  lastmod: (item) => item.updatedAt,
}
```

The exporter and sitemap now know which concrete URLs exist. A route pattern alone cannot enumerate them. `lastmod` is optional: an ISO date, written as the sitemap's `<lastmod>`.

The head is a closed set of fields: `title`, `description`, `type`, `image`, `published` and `noindex`. Any other field, such as `twitter` or `jsonLd`, is HZ014, because the rest is derived: canonical, Open Graph, `twitter:card` and the JSON-LD. The share card is derived from the image: `og:image:width` and `height` from the file, `og:image:alt` from the title, and a large `twitter:card` from 600 px wide; use a 1200×630 image. `/sitemap.xml`, `/robots.txt` and, with a `site`, `/manifest.webmanifest` are derived too: an endpoint there is HZ046.

## Search and optional segments

Search schemas contain flat scalar values with defaults or nullable values. Use `ui.link(route, params, search)` to generate canonical query strings. Put shareable filters in the URL instead of a machine's private context.

Route modifiers support optional segments (`:slug?`, nullable string), one or more segments (`:path+`, string array), and zero or more segments (`:path*`, string array). The schema must match the modifier.

## Shared layouts
Pages are configuration, so a function is the layout: `const staff = (route, View) => ui.page(route, { views: [Sidebar, View], head: staffHead })`. A view's `seed` can start its machine from the address and from server data: `seed: ({ search, query }) => ({ step: search.step, email: query(me, {}).email })`. `head.input` and `head.render` receive `search` after `locale`, so a filtered page can have its own title.

## Missing pages and redirects

Declare a static error route and pass it as `project({ notFound })`. Hozu uses its page for unmatched URLs. `project({ error })` supplies a server-error page. When a page's head query declares errors, `head.failed` maps each one to a route without params (a 303 redirect) or to 403, 404 or 410, for example `failed: { Unauthorized: login, Forbidden: 403 }`.

Project HTTP options can declare a base path, a trailing-slash policy, explicit redirects and per-route headers. These are server behaviours; a static host must provide any HTTP rules it needs. Hozu does not provide arbitrary rewrites.

## Understand the design

Read [How Hozu works](/how-it-works/derived-rendering) for the decisions behind this API and their trade-offs.
