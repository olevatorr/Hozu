# Routes and pages

```ts
// routes.ts
export const home = route({ path: '/', params: null, search: z.object({ show: Show.default('all') }) })
export const itemPage = route({ path: '/items/:id', params: z.object({ id: z.string() }), search: null })
export const docs = route({ path: '/docs/:path+', params: z.object({ path: z.array(z.string()).min(1) }), search: null })
```
- `:x` one segment, `:x?` optional (nullable), `:x+` / `:x*` one-or-more / zero-or-more (string[]) (HZ024).
- `search`: flat scalars or enums, each with a default or nullable (HZ035). URLs are canonical (keys sorted,
  defaults left out). Changing `search` is a navigation: a filter in the URL is a plain `ui.link`, no machine.

```ts
// hozu.config.ts
export default project({
  schema: zodAdapter, styles: new URL('./app.css', import.meta.url),
  site: { url: 'https://example.com', name: 'Items', lang: 'en' },
  routes: { home, itemPage }, notFound: missing,           // notFound / error: routes rendered for 404 / 500
  pages: [
    ui.page(home, { views: [Board], head: { render: () => ({ title: 'Items' }) } }),
    ui.page(itemPage, {
      views: [Detail],
      head: {
        query: getItem,                                    // its failure sets the status (NotFound → 404)
        input: (params) => ({ id: params.id }),
        render: (item) => ({ title: item.title, description: item.title, type: 'article' }),
      },
      entries: { query: listItems, input: {}, params: (item) => ({ id: item.id }) },   // sitemap + static export
    }),
  ],
  features: [items],
})
```
- `head.render` fields: `title`, `description`, `type` (`'website' | 'article'`), `image` (a URL, `ui.asset(...)`
  or `ui.og({ title })`), `published`, `noindex`. `head.redirects: { Unauthorized: login }` maps errors to routes.
- A detail view: `ui.view({ route: itemPage, render: ({ params }) => ui.query(getItem, { id: params.id }, { ready,
  failed: { NotFound: () => ui.p({}, ['Not found']), Unexpected: () => … } }) })`.
- A page loads JS only when a machine-bound part renders on it (`hozu plan <route>`). A view with a machine listed
  on several pages, in the same order, keeps its DOM and state across links when it never reads `params` / `search`.
