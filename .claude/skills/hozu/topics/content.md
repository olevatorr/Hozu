# Markdown, images, share images, fonts, preview, offline

- **Markdown:** `@hozu/content`: `const posts = await loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema })`
  in `app.ts` gives `{ slug, data, html, headings }`; return it from query resolvers and render `ui.html(post.html)`.
- **Images:** `ui.img({ src: ui.asset(new URL('./hero.jpg', import.meta.url)), alt, width, height })` (HZ028 without
  dimensions). With `@hozu/image`, `hozu build` adds WebP `srcset` widths.
- **Share images:** `head.render → image: ui.og({ title, subtitle })` (needs `og: ogImage` from `@hozu/image` in
  `createServer`); on a static host use `image: ui.asset(new URL('./share.png', import.meta.url))`.
- **Fonts:** a local `@font-face` gets a size-matched fallback automatically.
- **Page transitions:** links cross-fade (CSS view transitions, no JS); turn off with
  `@view-transition { navigation: none; }` in `app.css`.
- **Preview:** `createServer({ preview: { secret } })`; `/_hozu/preview?secret=…&path=/posts/a` turns it on; resolvers
  read `ctx.preview`; preview responses are never cached.
- **Offline:** `site.offline: route` (a static page) makes a service worker (HZ043).
