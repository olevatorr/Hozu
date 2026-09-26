# ADR 0020 — Phase 8b: font fallback metrics, Markdown content collections, state-preserving reload

- Status: accepted. The user approved all three items and a third-party Markdown dependency.
- Scope: Tier 3 items 14, 15 and 17 of ADR 0011. This completes Tier 3.

## 1. Font fallback metrics (item 14)
While a web font loads, the browser shows a system font with different metrics, and the text reflows when the web
font arrives (CLS). The mainstream fix, used by `next/font` and Capsize, is a fallback `@font-face` that scales a
local font to the web font's metrics.

**Decision:** `@tenon/css` derives it at build time.
- For every `@font-face` whose `src` is a local file (TTF, OTF, WOFF or WOFF2), it reads `head`, `hhea` and `OS/2`
  from the file:
  - WOFF tables are zlib-compressed;
  - WOFF2 is one Brotli stream. These tables are never transformed, so `node:zlib` is enough and no dependency is
    added.
- It emits `@font-face { font-family: "<Family> Fallback"; src: local("Arial"); size-adjust; ascent-override;
  descent-override; line-gap-override }`:
  - `size-adjust` is the ratio of average character widths (`xAvgCharWidth / unitsPerEm`) to the local font's;
  - the overrides are the web font's vertical metrics divided by that ratio.
- The local font is Arial, or Courier New when the family name contains "mono". Their widths are constants, as in
  Capsize.
- Every `font-family` list in the compiled CSS that names the family gets `"<Family> Fallback"` right after it,
  including Tailwind theme variables. This is derived, with no authoring API.
- A font that cannot be parsed keeps today's output, and the dev log says so.

## 2. Markdown content collections (item 15)
| Option | Trade-off |
|---|---|
| a. A new core concept (`collection()`) with its own IR node | A 16th core export and a second data model beside queries |
| **b. Content is a query implementation: `@tenon/content` turns a folder of Markdown files into typed entries a resolver returns** | Views, caching, tags and SEO stay exactly as they are for any query. The file format is a server concern |

**Decision (b).**
```ts
// server.ts
const posts = await loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema: PostFrontmatter })
implement(listPosts, () => posts.map(({ slug, data }) => ({ slug, ...data })))
implement(getPost, ({ slug }, { fail }) => posts.find((p) => p.slug === slug) ?? fail('NotFound', { slug }))
// a view renders the body with ui.html(post.html)
```
- **Files:** `<slug>.md` with a YAML front matter. The front matter is validated by the collection's schema. An
  invalid file stops startup with the file name and the issues, as the environment does (ADR 0019).
- **Entry:** `{ slug, data, html, headings }`. `headings` are `{ depth, text, id }`, with ids derived from the text,
  for tables of contents.
- **Dependencies:** `marked` (Markdown → HTML, no dependencies) and `yaml` (front matter). Both sit only in
  `@tenon/content`, a server-side package like `@tenon/image`. The zero-dependency rule of the runtime packages is
  unchanged.
- **Trust:** the HTML comes from the project's own files, which is the "trusted query data" case of `ui.html`
  (TN030 only flags client-controlled values). Raw HTML inside Markdown is passed through; the README says so.
- **Without a file system (edge):** `parseCollection({ files: { 'hello.md': text }, schema })` does the same from
  strings, for bundlers that import files as text.

## 3. Reload that keeps machine state (item 17)
| Option | Trade-off |
|---|---|
| a. Hot-swap view code in place | Needs module replacement of the IR and a partial re-render: a second runtime |
| **b. Keep the full reload, and restore each machine's snapshot when its machine did not change** | Uses what exists: the snapshot is data, and hydration already accepts one |

**Decision (b), development only.**
- `@tenon/dev` serves a development client bundle in place of `/_tenon/client.js`. It is built from the same source
  with `globalThis.__TENON_DEV__` defined as `true`.
- On a code change, the dev client asks the page for every app's snapshot, stores it in `sessionStorage` with the
  JSON of that feature's machine IR, and reloads.
- During the next hydration, a feature whose machine IR is unchanged starts from its stored snapshot. A feature
  whose machine changed starts fresh, because its old state may no longer exist.
- The production bundle defines the flag as `false`, and minification removes the code, so P7 does not change.
- Server data is fetched again, which is correct after a code change.

## Diagnostics
None new. Invalid front matter is a startup error that names the file, like invalid environment values.

## Verification
- **Fonts:** synthetic TTF, WOFF and WOFF2 files built in the test give the expected overrides. On macOS, Arial
  against itself gives `size-adjust: 100%`. `examples/showcase`, which has no local font file, is unchanged, so parity
  is unaffected.
- **Content:** `examples/blog` moves its two posts into `content/posts/*.md`, keeping titles, excerpts and dates, so
  the SEO tests keep passing. Unit tests cover invalid front matter, headings and `parseCollection`.
- **Reload:** in happy-dom, a stored snapshot is restored when the machine is unchanged and discarded when it
  changed. A dev-server test checks that `/_tenon/client.js` is the development bundle. The production bundle
  contains no `__TENON_DEV__` code (P7).
