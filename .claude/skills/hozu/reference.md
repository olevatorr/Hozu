# Hozu reference

Open the section the task needs. The core API is in `SKILL.md`.

## Routes
```ts
export const docs = route({ path: '/docs/:path+', params: z.object({ path: z.array(z.string()).min(1) }), search: null })
```
- `:x` one segment (string), `:x?` optional (nullable string), `:x+` one or more / `:x*` zero or more (string[])
  (HZ024).
- `search`: a flat object of scalars or enums, each with a default or nullable (HZ035); `null` = no query string.
- URLs are canonical: keys sorted, defaults left out. `ui.link(home, null, { show: 'unread' })`. Changing `search`
  is a navigation, so a filter in the URL is a plain link and needs no machine.

## Views: events and DOM fields
- Any DOM event name, plus `visible` (the element entered the viewport).
- `ui.dom.value`: text. Into an enum field only from a `<select>` whose literal option values are all members
  (HZ033).
- `ui.dom.form('name')`: a named field of the submitted form (on `submit`; the browser runs `required` /
  `minlength` first). Into an enum field when the name belongs to a `<select>` (or radios) in the form whose
  literal option values are all members, so one submit carries a title and a priority.
- `ui.dom.valueAsNumber` (number | null), `ui.dom.checked`, `ui.dom.key`, and similar event fields.
- Also: `ui.html(value)` (trusted HTML from query data only, HZ030), `ui.asset(new URL('./x.png', import.meta.url))`,
  `ui.window({ on })` / `ui.document({ on })` for global listeners, widgets (`ui.widget` / `ui.use`) for
  third-party DOM libraries.

## Forms without JavaScript
A submit whose payload reads only `ui.dom.form('name')`, literals, context, params and search also works without JS
(otherwise HZ036 warns). The server runs the same machine and mutation, then redirects (on `navigate`, or when the
machine is back where it started) or re-renders the page with the result (for example an error alert). Put every
value the submit needs in named fields: a `<select name="kind">`, not a separate change event.

## Field errors (`Invalid`)
Every mutation also has the framework error `Invalid` = `{ message, fields }`: one key per top-level input field
(`string | null`). It is returned when the input fails its schema (put limits there:
`z.string().min(2, 'Use at least 2 characters')`), and a resolver can return it:
`fail('Invalid', { message, fields: { title: 'Already taken' } })`.
- `failed.Invalid` is optional (without it, `Unexpected` handles it).
- With it: `assign: (e) => [op.set(ctx.fields, e.fields)]`, and show `ctx.fields.title` under the input with
  `'aria-invalid': op.neq(ctx.fields.title, null)`.
- Never declare errors named `Invalid` or `Unexpected` yourself (HZ014).

## Pages
`ui.page(route, { views, head, entries?, assert? })`.
- `head.render` returns `{ title, description?, type?: 'website' | 'article', image?, published?, noindex? }`.
  `head.query` + `head.input: (params, locale) => …` load data for it; a failing head query sets the HTTP status
  (NotFound → 404). `head.redirects` maps declared errors to routes.
- `entries: { query, input, params: (item) => … }` lists the pages of a route with params for the sitemap.
- `project({ notFound: route, error: route })` renders those pages for 404 / 500.
- A view listed with a machine on several pages, in the same order, stays mounted when links move between them
  (see `patterns.md`).

## Sessions
- `project({ session: z.object({ user: z.string() }) })` declares the identity. Queries with `scope: 'user'` and
  mutations receive `session`; public resolvers never do.
- `createServer({ session: (request) => value })`, or `sessionCookie({ name, secret })` from
  `@hozu/runtime-server` for a signed cookie. Mutations can call `setSession(value)`.

## Languages (i18n)
- `site: { lang: 'en', locales: ['en', 'zh-TW'], … }`: every URL gets a locale prefix (`/en/posts/a`). Routes and
  `ui.link` stay locale-free; links keep the current locale. `/` and locale-less URLs redirect by
  `Accept-Language`. `<html lang>`, hreflang, og:locale and the sitemap are derived.
- Text: `export const text = ui.messages('en', { en: { saved: '{count} saved' }, 'zh-TW': { saved: '已儲存 {count} 筆' } })`,
  added to the feature's `declarations`. Use `text.title` or `text.saved({ count })` in views and `head.render`.
  Every locale needs every key with the same `{placeholders}` (HZ040). Plurals:
  `'{n, plural, =0 {none} one {# item} other {# items}}'`; `select` also works.
- Machines never hold translated text (HZ041): store a code (`'duplicate'`) and pick the message in the view.
- `ui.format.number(x, { style: 'currency', currency: 'EUR' })`, `ui.format.date(x, { dateStyle: 'medium' })`,
  `ui.format.relative(n, 'day')`, `ui.format.list(xs)`.
- `locale` is in every view scope and the second argument of `head.input`. `ui.alternate('zh-TW')` is the current
  page in another locale.

## Environment
`project({ env: { server: z.object({ DB_URL: z.string() }), public: z.object({ SUPPORT_EMAIL: z.string().email() }) } })`.
Both are parsed when the server starts (defaults and `z.coerce` apply; a missing value stops startup). Resolvers get
`ctx.env` (server values). Views read public values with `ui.env(PublicEnv).SUPPORT_EMAIL`. Machines cannot read env
(HZ041).

## HTTP
Without `http`, the site is served at `/` without trailing slashes (`/about/` answers 308 → `/about`).
```ts
http: {
  basePath: '/shop',                   // every URL and /_hozu/* move under it (HZ039)
  trailingSlash: 'always',             // or 'never'; the other form answers 308
  redirects: {                         // keyed by the old path; never a path a page owns (HZ037)
    '/blog/:slug': { to: (p) => ui.link(post, { slug: p.slug }), permanent: true },   // 308
    '/docs': { to: 'https://docs.example.com', permanent: false },                     // 307
  },
  headers: [{ routes: 'all', set: { 'permissions-policy': 'camera=()' } }],   // or routes: [post]; not cache-control (HZ038)
},
```
There are no rewrites: one URL has one owner.

## Server options
`createServer({ build, styles, resolvers, session?, onError?, csp?, images?, og?, preview? })` from
`@hozu/adapter-node`.
- `onError(error, { effect | path })` receives every unexpected failure.
- A strict CSP, `nosniff` and a cross-site POST check are on by default (`csp` adds sources, e.g.
  `{ script: ['https://analytics.example'] }`, or `false`).
- Test a mutation with curl:
  `curl -X POST localhost:4700/_hozu/effect -H 'content-type: application/json' -d '{"effect":"items.addItem","input":{"title":"x"},"keys":[]}'`.

## Content, images, share images, fonts
- **Markdown:** `@hozu/content` turns `content/posts/*.md` (YAML front matter checked by a schema) into
  `{ slug, data, html, headings }`: `const posts = await loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema })`
  in `server.ts`, returned from ordinary query resolvers; render the body with `ui.html(post.html)`.
- **Images:** `ui.img({ src: ui.asset(new URL('./hero.jpg', import.meta.url)), alt, width, height })` (HZ028 without
  dimensions). With `@hozu/image` installed, pass `images: await optimizeImages(build)` to `createServer` (and
  `hozu build` does it itself): raster assets get WebP `srcset` widths and `sizes`.
- **Share images:** `head.render` → `image: ui.og({ title, subtitle })` renders a 1200×630 card; pass
  `og: ogImage` (from `@hozu/image`) to `createServer`.
- **Fonts:** a local `@font-face` gets a size-matched `"<Family> Fallback"` automatically.

## Preview (drafts)
`createServer({ preview: { secret } })`; `GET /_hozu/preview?secret=…&path=/posts/a` turns preview on (a signed
cookie), `/_hozu/preview/exit` turns it off. Resolvers get `ctx.preview`; preview responses are never cached and are
noindex.

## PWA and offline
A web app manifest is derived from `site` (`name`, `themeColor`, `icon`). `site.offline: route` is a static page
shown when the network is down; a service worker is generated (HZ043: no params, no per-request data).

## Testing rendered pages
`const app = testApp({ build, resolvers })` from `@hozu/testing`; `await app.get('/')` gives
`{ status, headers, html, text, payload }`; `app.post(path, fields)` submits a native form.

## Deployment
`hozu build` writes `dist/public/` (static files for any host or CDN) and `dist/manifest.json`. On Node:
`createServer({ build: buildProject(project, { manifest }), manifest, publicDir: 'dist/public', … })`. On Bun, Deno,
Cloudflare Workers or Vercel the server is `createHandler({ build, manifest, resolvers, render })` from
`@hozu/runtime-server` with `export default { fetch: handler.fetch }`, where
`import * as render from './dist/server/render.js'` is the page code `hozu build` generates (edge runtimes cannot
generate it at startup). Page cache and tag revalidation are per instance.
```ts
import manifest from './dist/manifest.json' with { type: 'json' }
import * as render from './dist/server/render.js'
const handler = createHandler({ build: buildProject(project, { manifest }), manifest, render, resolvers: createResolvers() })
export default { fetch: handler.fetch }
```
