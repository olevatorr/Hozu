# ADR 0008 — Route params, page head metadata, crawler endpoints

- Status: accepted
- Trigger: Trial 0001 (blog). The SEO audit passed 19/45 checks; articles needed one route and one view each.

## D1 — Route params
`route({ path: '/posts/:slug', params: z.object({ slug: z.string() }) })`. `params` is required; routes without
parameters pass `null`. Placeholders must equal the schema's keys (`TN024`). `RouteIR` stores the JSON Schema.
Views that read params bind to a route: `ui.view({ machine, route, render: ({ params, ctx, when }) => … })`, with
`route: null` for route-independent views. Params are a `ValueExpr` source (`{ ref: 'params' }`). A view or
head bound to route A but rendered on route B is `TN024`.

## D2 — Pages are typed per route
`ui.page(route, { views, assert, head, entries })` replaces the plain object from ADR 0006, so the page's
`head` and `entries` callbacks are typed by the route's params. It lives in the `ui` namespace, keeping the
public surface at 15 exports.

## D3 — Head metadata
Options: (a) a free-form `<head>` tree, (b) arbitrary meta tag lists, (c) a closed, typed set of fields from which
tags are derived. **Chosen: (c)**, one canonical form:
```ts
head: { query: getPost, input: (params) => ({ slug: params.slug }),
        render: (post) => ({ title: post.title, description: post.excerpt, type: 'article',
                             image: null, published: post.publishedAt, noindex: false }) }
```
`query` may be `null`. The server derives `<title>`, `meta description`, `canonical`, Open Graph
(`og:title/description/type/url/site_name/image`, `article:published_time`), JSON-LD (`WebSite` or `Article`) and
`robots noindex`. The head query is an ordinary query: cached, tagged, and part of the render plan (region
`head`), so a user-scoped head query makes the page per-request like any other region.
**HTTP status is derived**: if the head query fails with a declared error, the page is `404`; `Unexpected`
gives `500`.

## D4 — Site
`project({ site: { url, name, lang } | null })`. `url` feeds `canonical`, `og:url` and the sitemap; `lang` feeds
`<html lang>`. `null` means no canonical, no sitemap and no robots `Sitemap:` line.

## D5 — Entries, sitemap, static export
A parameterized page declares how to enumerate itself:
`entries: { query: listPosts, input: {}, params: (post) => ({ slug: post.slug }) }` (`null` for routes without
params). The sitemap and the static export expand entries. A parameterized page without entries is `TN025`
(warning): it still renders on request, but crawlers cannot discover it and static export skips it.

## D6 — Crawler endpoints (adapters)
`HEAD` returns the `GET` status and headers without a body. `adapter-node` serves `/robots.txt` (allow all;
`Disallow` for `noindex` routes without params; `Sitemap:` when `site` is set) and `/sitemap.xml` (every
non-`noindex` page, expanded via entries). `adapter-static` writes both files.

## Codes
| Code | Name | Patch |
|---|---|---|
| TN024 | route-mismatch (placeholders ≠ params, or view/head bound to another route) | none |
| TN025 | undiscoverable-page (warning) | none (snippet: entries) |
