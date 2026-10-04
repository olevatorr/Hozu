# Markdown, images, share images, fonts, preview, offline

- **Markdown:** `npm install @hozu/content` (not in the scaffold), then in `app.ts`
  `const posts = await loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema })`: one
  `{ slug, data, html, headings }` per `.md` file. Return them from query resolvers and render `ui.html(post.html)`.
- **Images:** `ui.img({ src: ui.asset(new URL('./hero.jpg', import.meta.url)), alt, width, height })` (HZ028 without
  dimensions).

<!-- more -->

- **Collections in detail:**
  - `slug` is the file name without `.md`.
  - Only the folder's own files are read, not sub-folders; entries come in file-name order (sort them in the
    resolver).
  - `data` is the front matter parsed as YAML 1.2 and checked against `schema`. An unquoted date such as
    `2026-09-12` stays a string, so `z.iso.date()` fits.
  - A front matter error or a schema mismatch throws with the file name at startup.
  - There are no conventional fields: a draft flag or an excerpt is a field in your schema.
  - `html` is GFM; headings get ids, listed in `headings`.
  - Style it with your own CSS for the container (the `prose` class needs the Tailwind typography plugin in
    `app.css`, otherwise HZ026).

- **Images:** with `@hozu/image`, `hozu build` adds WebP `srcset` widths.
- **Share images:** `head.render → image: ui.og({ title, subtitle })` (needs `app({ og: ogImage })` with `ogImage`
  from `@hozu/image`); on a static host use `image: ui.asset(new URL('./share.png', import.meta.url))`.
- **Fonts:** a local `@font-face` gets a size-matched fallback automatically.
- **Page transitions:** links cross-fade (CSS view transitions, no JS); turn off with
  `@view-transition { navigation: none; }` in `app.css`.
- **Preview:** `app({ preview: { secret } })`; `/_hozu/preview?secret=…&path=/posts/a` turns it on; resolvers
  read `ctx.preview`; preview responses are never cached.
- **Offline:** `site.offline: route` (a static page) makes a service worker (HZ043).
