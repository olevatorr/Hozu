# Routes and pages

```ts
// routes.ts
export const home = route({ path: '/', params: null, search: z.object({ show: Show.default('all') }) })
export const itemPage = route({ path: '/items/:id', params: z.object({ id: z.string() }), search: null })
export const docs = route({ path: '/docs/:path+', params: z.object({ path: z.array(z.string()).min(1) }), search: null })
```
- `:x` one segment, `:x?` optional (nullable), `:x+` / `:x*` one-or-more / zero-or-more (string[]) (HZ024).
- `search`: flat scalars or enums, each with a default or nullable (HZ035).
- **Pages** go in `project({ routes: { home, itemPage }, pages: [...] })` (the whole config: see --more):
  `ui.page(home, { views: [Board], head: { render: () => ({ title: 'Items' }) } })`.
- **Head from a query:** `head: { query: getItem, input: (params, locale) => ({ id: params.id }), render: (item) => ({ title:
  item.title }), failed: { NotFound: 404 } }`. `failed` maps every declared error of the query (HZ051) to a route
  without params (303) or to `403`, `404` or `410`.
- `head.render` fields: `title`, `description`, `type` (`'website' | 'article'`), `image`, `published`, `noindex`;
  any other is HZ014 (Open Graph, `twitter:card` and the JSON-LD are derived from these).
- A route no page renders is HZ052.

<!-- more -->

- URLs are canonical (keys sorted, defaults left out). Changing `search` is a navigation: a filter in the URL is a
  plain `ui.link`, no machine.

```ts
// hozu.config.ts
export default project({
  schema: zodAdapter, app: new URL('./app.ts', import.meta.url), styles: new URL('./app.css', import.meta.url),
  site: { url: 'https://example.com', name: 'Items', lang: 'en' },
  routes: { home, itemPage }, notFound: missing,           // notFound / error: routes rendered for 404 / 500
  pages: [
    ui.page(home, { views: [Board], head: { render: () => ({ title: 'Items' }) } }),
    ui.page(itemPage, {
      views: [Detail],
      head: {
        query: getItem,
        input: (params) => ({ id: params.id }),
        render: (item) => ({ title: item.title, description: item.title, type: 'article' }),
        failed: { NotFound: 404 },                         // every declared error of the query (HZ051)
      },
      entries: { query: listItems, input: {}, params: (item) => ({ id: item.id }) },   // sitemap + static export
    }),
  ],
  kits: [kit],                                             // shared UI (hozu docs components)
  features: [items],
})
```
- `image` is a URL, `ui.asset(...)` or `ui.og({ title })`. The share card is derived: `og:image:width` / `height`
  from the file, `og:image:alt` from the title, `twitter:card` large from 600 px wide. Use a 1200×630 image.
- `entries.lastmod: (item) => item.updatedAt` (an ISO date) adds `<lastmod>` to the sitemap.
- `site.url: { env: 'SITE_URL' }` reads the origin at startup from a variable declared in `env.public` (HZ085).
- Check the head without a server: `hozu get / --select 'meta[property^="og:"]'`; `--select script` prints the JSON-LD.
- `head.failed` example: `failed: { Unauthorized: login, Forbidden: 403 }`. `Unexpected` is always 500.
  It maps declared errors only: a head query that always fails is not a redirect.
- **Which redirect** (one per purpose):

| Need | Form |
|---|---|
| a static path moved | `http.redirects` (`hozu docs http`) |
| this visitor may not see the page | `head.failed` |
| a decision on success, e.g. `/` by session | a GET endpoint with `output: 'redirect'` (`hozu docs endpoints`) |
| after a machine transition | `navigate` |

- For a route no page renders (HZ052), link to an endpoint with `ui.link(endpoint, input)` instead.
- A detail view: `ui.view({ route: itemPage, render: ({ params }) => ui.query(getItem, { id: params.id }, { ready,
  failed: { NotFound: () => ui.p({}, ['Not found']), Unexpected: () => … } }) })`.
- A page loads JS only when a machine-bound part renders on it (`hozu plan <route or path>`). Every link loads a document;
  state across pages lives in the URL (`seed`), on the server (queries) or in a client component's own storage.
