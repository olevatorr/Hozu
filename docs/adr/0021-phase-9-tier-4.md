# ADR 0021 — Phase 9 (Tier 4): preview mode, OG images, PWA and offline, a test helper

- Status: accepted. The user asked to finish Tier 4 and then run a verification (an AI trial and the benchmarks).
- Scope: Tier 4 of ADR 0011. No principle changes. The only new dependency use is `sharp`, through
  `@tenon/image`, which the project already approved in ADR 0017.

## 1. Preview mode (draft content)
| Option | Trade-off |
|---|---|
| a. A query input field `draft: true` | Anyone can request drafts, and drafts reach the shared cache |
| **b. A signed preview cookie; preview requests bypass every cache; resolvers see `ctx.preview`** | Drafts never reach a cacheable response, the same rule principle 8 applies to user data |

**Decision (b).**
- `createHandler({ preview: { secret } })`. The secret must be at least 32 characters.
- **Entering:** `GET /_tenon/preview?secret=…&path=/posts/a` checks the secret in constant time, sets
  `tenon_preview` (HMAC-signed, HttpOnly, SameSite=Lax) and answers 307 to `path`. Only an internal path is accepted:
  it must start with `/` and not with `//`.
- **Leaving:** `GET /_tenon/preview/exit?path=…` clears the cookie.
- **In preview:**
  - pages skip the ISR/SWR page cache and the data cache;
  - responses are `cache-control: private, no-store` with `x-robots-tag: noindex`;
  - resolvers receive `ctx.preview = true` and may return drafts. `ctx.preview` is always `false` outside
    preview.

## 2. Open Graph images
| Option | Trade-off |
|---|---|
| a. JSX → SVG (satori) | Another dependency and a second view language |
| **b. A fixed, well-designed card rendered from data: `head.image: ui.og({ title, subtitle })`** | One canonical card per site (name, title, subtitle, theme color). Custom art stays a static `ui.asset` |

**Decision (b).**
- `ui.og({ title, subtitle })` records a head value. The server turns it into
  `<basePath>/_tenon/og.png?title=…&subtitle=…`, and `og:image` becomes absolute with `site.url`.
- The handler serves `/_tenon/og.png` through an injected renderer: `createHandler({ og: ogImage })`.
  - `ogImage` comes from `@tenon/image`: an SVG template at 1200×630, rendered by sharp.
  - Without a renderer the route is a 404, and the runtime stays free of dependencies.
- Text is capped (title 120, subtitle 200 characters) and escaped. Responses are cached by URL, with immutable
  caching headers, so repeated requests do not re-render.

## 3. PWA and offline
- **Manifest (derived):** a site with `site` set serves `<basePath>/manifest.webmanifest` built from `name`,
  `themeColor` and `icon`, and every page links it. There is nothing to author.
- **Offline (opt-in):** `site.offline: route | null`. It is a new required field; `null` for none.
  - When set, the handler serves `<basePath>/sw.js` and a tiny same-origin registration script, which pages load as
    an external module, so the CSP stays hash-based.
  - The worker precaches the offline page. Navigations are network-first, falling back to it. Hashed
    `/_tenon/a/`, widget and stylesheet files are cache-first. Anything else, including `/_tenon/effect` and
    `/_tenon/query`, is never cached.
- **TN043** (invalid-offline-page): the offline route has params, or its page has a per-request region. It must be
  one static page, because the worker stores it once.

## 4. A test helper for rendered pages
**Decision:** a new package, `@tenon/testing` (no dependencies), with
`testApp({ build, resolvers, session, env, preview })`, which returns `{ get(path, init?), post(path, form) }`.
- Each call returns `{ status, headers, html, text, payload }`.
- `text` is the visible text: scripts, styles and comments removed, entities decoded, whitespace collapsed.
- `post` submits a native form, so no-JS behaviour is testable in one line.
- It uses the real handler, so what is tested is what is served.

## Diagnostics
| Code | Name | Severity |
|---|---|---|
| TN043 | invalid-offline-page | error |

## Verification
- **Preview:**
  - entering needs the secret, and the path cannot leave the site;
  - a preview page shows a draft that the public page never shows, even after the preview request;
  - the headers of a preview response.
- **OG:** the head carries an absolute URL, the PNG is 1200×630, and the route is a 404 without a renderer.
- **PWA:** the manifest's fields; `sw.js` and the registration script only when `offline` is set; TN043. The blog gets
  an offline page.
- **Testing helper:** it is used by the other tests of this phase.

## Implementation notes
- **Preview:** the data runtime's `run` takes `{ preview }`. Preview queries skip the cache entirely (they are
  neither read from it nor written to it), and resolvers receive `ctx.preview`. `examples/blog` has a draft post
  (`draft: true` in its front matter) that only appears in preview; a test checks that public pages requested after
  a preview request still do not show it.
- **OG:** the card wraps CJK text by character (a wide character counts double), so Chinese titles do not
  overflow. An `og:image` or JSON-LD `image` that is a path now becomes absolute with `site.url`. The blog's post
  pages use `ui.og`.
- **PWA:** the manifest link is added to every site with `site` set, which changes the head of existing pages but not
  what they render. The blog's offline page is `noindex`, so `robots.txt` now disallows it.
- **`@tenon/testing`** needs no dependency: `text` strips `<head>`, scripts, styles and comments and decodes entities.

