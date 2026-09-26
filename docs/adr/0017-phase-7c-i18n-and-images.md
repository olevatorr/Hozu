# ADR 0017 — Phase 7c: internationalisation and optional image optimisation

- Status: accepted. Every locale is prefixed (option d), and sharp may be added to the repository (user decision).
- Scope: Tier 2 items 8 and 9 of ADR 0011.
- **i18n** uses no third-party code: locales in the URL, messages as typed data, formatting through the platform's
  `Intl`.
- **Image optimisation** is optional. It is a build-time package, `@tenon/image`, which depends on sharp. A project
  gets `srcset` only when it installs that package; without it, images behave exactly as today.

# Part A — Internationalisation

## A1. Where the locale lives
| Option | Trade-off |
|---|---|
| a. Cookie or `Accept-Language` only | One URL shows different languages: not crawlable, not shareable, and the page cache must vary on a header |
| b. Domain or subdomain per locale | Needs DNS and hosting setup outside the framework |
| c. Path prefix, except for the default locale (`/about`, `/de/about`) | The most common choice, but a URL's locale then depends on whether it has a prefix |
| **d. Path prefix for every locale (`/en/about`, `/de/about`)** | Every page URL names its locale. `/` alone has no locale |

**Decision (d).**
- `project({ i18n: null | { locales: ['en', 'de', 'zh-TW'] } })`, where `site.lang` is the default locale and must
  be one of `locales`.
- Route paths stay locale-free (`/posts/:slug`). The route table prefixes `/:locale` after `basePath`, the same way
  it applies `basePath` and the trailing slash today. So `ui.link`, `navigate`, the sitemap and the canonical URL
  pick it up without new code.
- `ui.link(...)` stays in the current page's locale. A language switcher uses
  **`ui.alternate(locale)`**, the current page's URL in another locale.
- `/` answers **307** to the best match of `Accept-Language` among `locales`, with `Vary: Accept-Language`. It
  falls back to `site.lang`. A path without a locale that matches a page (`/posts/a`, as it was before i18n) is
  negotiated the same way, so old links keep working. These are the only negotiated responses. An unknown locale
  segment is a 404.
- Translated slugs (`/de/ueber-uns`) are not part of this phase. The path is the same in every locale.

(d) changes every existing URL of a site that turns i18n on, because the default locale also gets a prefix. (c)
would keep them, but then "which locale is this URL" has two answers. **Decision (user): (d).**

## A2. Messages
```ts
// features/bookmarks/messages.ts
export const text = ui.messages({
  en: { title: 'Bookmarks', saved: '{count} saved', empty: 'Nothing yet' },
  'zh-TW': { title: '書籤', saved: '已儲存 {count} 筆', empty: '還沒有內容' },
})
// feature({ messages: text, ... })
// in a view: ui.h1({}, [text.title]), ui.p({}, [text.saved({ count: items.length })])
```
- **A declaration, not a top-level export.** `ui.messages` joins `ui.view`, `ui.page` and `ui.widget`, so
  `@tenon/core` stays at 15 exports (A3).
- **Types come from the default locale.** Every other locale must have the same keys (TypeScript checks this).
  `{name}` placeholders become the argument type of the message.
- **Validator:** **TN040** (incomplete-messages) reports a missing key or different placeholders in any locale,
  including when the types were bypassed.
- **IR:** `FeatureIR.messages: Record<locale, Record<key, string>>`, and a new `ValueExpr` form
  `{ msg: 'bookmarks.saved', args: ValueExpr }`.
- **Messages are view and head data only.** A machine or a contract that references a message is **TN041**
  (message-in-machine), so contracts stay locale-independent. The pattern is to store a code in context (for example
  `ctx.error = 'duplicate'`) and choose the message in the view.
- **Plurals and selection:** `{count, plural, one {# item} other {# items}}` (ICU subset: `plural` and `select`),
  evaluated with `Intl.PluralRules`. No third-party message format library.

## A3. The locale as a value
- A new reference source `locale` is available in views, queries' inputs and `head`. For example,
  `ui.query(getPost, { slug: params.slug, locale })` fetches localised content. Resolvers get the locale through
  their typed input, not an implicit context.
- **Formatting:** `ui.format.number(x, { style: 'currency', currency: 'EUR' })`, `ui.format.date(x, { dateStyle:
  'medium' })`, `ui.format.relative(x, 'day')` and `ui.format.list(xs)`. Each is a closed set of `Intl` options,
  typed and checked as literals (TN031).
- **Head:** `<html lang>` is the page's locale. Every page also gets:
  - `<link rel="alternate" hreflang>` for each locale, plus `x-default` pointing to the default locale;
  - `og:locale` and `og:locale:alternate`.

  The sitemap lists each locale's URL.

## A4. Keeping the client budget
P7 has 28 B left, so message and `Intl` evaluation must not reach the initial client.
- When the server serialises island nodes, it **lowers** every `{ msg }` and `ui.format.*` for the page's locale:
  - a message without arguments becomes a literal;
  - anything else becomes a call to a framework function (`#format`, `#number`…) in `/_tenon/fns.js`, with the
    template and the locale as literal arguments.

  `fns.js` is already loaded on demand, so the initial JS does not grow, and the payload carries only the current
  locale's strings.
- Soft navigation (ADR 0015) never keeps a view across a change of locale. `navigate.js` compares the locale
  segment and otherwise leaves the navigation to the browser.

## A5. Rendering and caching
- Pages are cached per canonical URL, and the locale is part of that URL, so ISR, SWR and static export need no
  special case. The static export writes every locale's pages.
- `head.render` may use messages, so titles and descriptions are translated.
- **TN042** (invalid-i18n) reports:
  - an empty `locales` list;
  - a `site.lang` that is not in `locales`;
  - a tag that is not a well-formed BCP 47 language tag;
  - `ui.alternate` with a locale that is not declared.

# Part B — Optional image optimisation

## B1. Where it runs
| Option | Trade-off |
|---|---|
| a. On request (an image endpoint, like Next's `/_next/image`) | Needs sharp at runtime, so no edge deployment and CPU per request. It also needs a cache |
| **b. At build time, only for `ui.asset` images** | Runs once. The runtime and edge stay free of third-party code. Images from query data (remote URLs) are not resized |

**Decision (b).**
- `@tenon/image` exports `optimizeImages(build)`, like `compileStyles`. It generates WebP widths (640, 960, 1280,
  1920, capped at the intrinsic width) for every raster asset that an `<img src>` uses.
- `tenon build` loads it from the project's dependencies when it is installed and writes the variants to
  `dist/public/_tenon/a/`. The manifest records `variants` per asset.
- On Node without a build, `createServer({ images: await optimizeImages(build) })` does the same at startup, as
  styles do.
- **If `@tenon/image` is not installed**, nothing changes: the original file with width and height, and TN028 as
  today.

## B2. What the page gets
- `<img src>` keeps the original file as the fallback. It gains `srcset` with the WebP widths, and `sizes`.
- `sizes` is derived from the `width` attribute (`(max-width: Wpx) 100vw, Wpx`) unless the author sets it.
- The element stays a single `<img>`. There is no `<picture>` wrapper, so the DOM, the CSS selectors and island
  hydration do not change.
- WebP is supported by every current browser. AVIF is left out because its encoding is much slower at build.
- `loading`, `decoding` and `fetchpriority` stay the author's choice, as they are already typed attributes. The
  framework does not make images lazy on its own, because a lazy image above the fold delays LCP.
- The IR does not change: variants are a build output, not part of the app's behaviour. So the IR hash and
  `tenon.lock.json` do not depend on whether `@tenon/image` is installed.

## B3. Dependency
- `@tenon/image` depends on `sharp`. That is a native module that downloads libvips, is used only at build, and
  is excluded from the zero-dependency rule in the same way as `@tenon/css` and `@tenon/bundle`.
- **Approved by the user:** `sharp` is added to this repository so that the package can be tested.

# Diagnostics
| Code | Name | Severity |
|---|---|---|
| TN040 | incomplete-messages | error |
| TN041 | message-in-machine | error |
| TN042 | invalid-i18n | error |

Each gets a registry entry, a rule, a fix and a mistake-catalog case. Images need no new code: TN028 still applies.

# Also fixed in this phase
The sitemap and `robots.txt` build paths from the raw route path, so they ignore `basePath` and `trailingSlash`
(found while writing this ADR; a 7b omission). They will use the route table like every other URL.

# Verification
- Unit tests:
  - routing with locale prefixes, `/` negotiation and 404 for unknown locales;
  - message types, TN040–TN042, and plural/select;
  - lowering: island payloads contain only the page locale's strings, and the initial JS is unchanged (P7);
  - `hreflang`, `og:locale` and the sitemap.
- **Example:** `examples/blog` gets English and Traditional Chinese (messages, a language switcher, a localised
  date). Blog is a content site, which is where i18n matters most. `examples/bookmarks` stays the skill's minimal
  reference, and the skill gains an i18n section in `patterns.md` that points to the blog.
- Chromium: switching language is a document navigation, and links inside a locale stay soft.
- **Images (only if sharp is approved):** a raster hero image in the blog. The test checks the generated widths,
  `srcset`/`sizes` in the HTML, and that the browser loads a WebP variant. The "not installed" path is tested in
  either case.

# Budgets
- **P7: unchanged by design (A4).** If lowering misses a case, it shows up here.
- **P8 (soft navigation):** grows by the locale check, and stays well under 3 KiB.
- **A4:** message types add instantiations for the blog, not for the cart, which A4 measures. It is reported
  anyway.

# Implementation notes
- **`site.locales` instead of `project({ i18n })`.** The locale list sits next to `site.lang`, which is the default
  locale. Projects without `site` are unaffected, and only 9 configs needed `locales: null` instead of a new
  top-level field in every project.
- **`feature({ messages: text | null })`**, like every other declaration. This is one more required line per
  feature (37 in the repository), accepted for consistency.
- **No new `ValueExpr` form.** A message is `{ fn: '#msg:feature.key', arg }`, a format is `{ fn: '#number', arg }`,
  and the new references are `locale` and `alternate`. The existing walkers, type inference and literal checks
  work unchanged; `#` names are reserved for the framework.
- **Server evaluation** uses a per-locale function table (memoised), so compiled fragments are cached per locale.
  Island nodes are lowered for the payload: a message without arguments becomes a literal, and anything else
  becomes a call to a generic helper in `fns.js` with the template and locale as literals. P7 went from 7,652 to
  7,650 B.
- **Locale-less page URLs negotiate** like `/`, so links from before a site turned i18n on keep working.
- **Two 7b bugs fixed here:** the sitemap, `robots.txt` and the speculation-rules exclusions ignored `basePath`.
  They now use the route table.
- **A client bug fixed here:** a nested `ui.query` or `ui.each` copied its outer bindings when it rendered, so after
  a refresh it kept reading stale outer data. The blog's plural count (`slugs.length` inside a nested query)
  exposed it. The inner scope now re-syncs its prefix on every update.
- **Images:** `@tenon/image` 0.0.0 depends on `sharp` 0.35.4 (prebuilt libvips binaries; pnpm skips its install
  script, which is not needed). Only raster assets used as `<img src>` are processed, so icons and SVGs are left
  alone.
- **"Not installed" in this monorepo:** the root lists `@tenon/image` for tests, so every example can resolve it,
  and `tenon build` writes `images: null` when there is nothing to optimise. The behaviour without the package is
  covered by rendering without `images` (no `srcset`), not by a project that really lacks it.

- **Gate:** P7 7,650 B (budget 7,680). P8 1,773 B. A4 53,186 (budget 55,000; 51,416 before), up from the new
  view-scope and `ui` types that every example sees. P2's scaling exponent is back to 1.096, so the 1.131 reported in
  ADR 0016 was noise. P9 10,188 req/s.

# Implementation order
1. i18n routing, `site.lang` and `locales`, `ui.alternate`, `/` negotiation, head, sitemap, plus the sitemap
   basePath fix.
2. Messages, TN040/TN041, lowering and `fns.js` helpers.
3. `ui.format.*` and plural/select.
4. `@tenon/image`: if approved, with sharp; otherwise only the not-installed path.
