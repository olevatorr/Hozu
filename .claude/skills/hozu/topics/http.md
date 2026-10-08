# HTTP

Without `http`, the site is served at `/` without trailing slashes (`/about/` answers 308 → `/about`).
`project({ http: { basePath, trailingSlash, redirects, headers } })` changes that (see --more). There are no
rewrites: one URL has one owner. Your own HTTP routes: `hozu docs endpoints`.

<!-- more -->

```ts
http: {
  basePath: '/shop',                   // every URL and /_hozu/* move under it (HZ039)
  trailingSlash: 'always',             // or 'never'; the other form answers 308
  redirects: {                         // keyed by the old path; never a path a page owns (HZ037)
    '/blog/:slug': { to: (p) => ui.link(post, { slug: p.slug }), permanent: true },
    '/docs': { to: 'https://docs.example.com', permanent: false },
  },
  headers: [{ routes: 'all', set: { 'permissions-policy': 'camera=()' } }],   // not cache-control (HZ038)
},
```
Server options live in the app module: `app({ resolvers, session?, components?, onError?, csp?, og?, preview?,
refreshSession?, dispose?, dataCache?, cache?, bus?, staticTtl? })` (`hozu docs deploy`).
A strict CSP, `nosniff` and a cross-site POST check are on by default; `csp: { img: ['https://…'] }` adds sources
(`script style img font connect frame media`).
