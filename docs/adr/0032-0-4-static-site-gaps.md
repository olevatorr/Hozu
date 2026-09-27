# ADR 0032 — 0.4.0: what the official site found (page transitions, static files, head images)

- Status: accepted (the user approved 0.4.0 after reviewing the site)
- Motivation: Codex built the official site (`site/`, ADR 0031) from the published authoring surface and
  recorded its gaps in `site/FRAMEWORK-GAPS.md`. The owner reported a third problem after deploying it.
  1. **Every link flashes.** The site has no islands, so every navigation loads a new document (ADR 0015). The
     browser paints a blank frame between the two pages. Speculation rules (prerender, `moderate`) only help in
     Chromium, and only after a hover of about 200 ms.
  2. **A linked file is missing from static exports.** Every page with a `site` links
     `/manifest.webmanifest`, but the handler generates it, and neither `exportStatic` nor `hozu build` writes
     it. With `site.offline`, the same holds for `/sw.js` and `/_hozu/sw-register.js`. No diagnostic says so.
  3. **`head.image` rejects `ui.asset(...)`.** The builder already turns an asset into its hashed URL, and the
     renderer makes it absolute with `site.url`. Only the type (`Val<string | null>`) stops it, so the site
     hard-coded `https://hozu.org/icon-256.png` and copied the file by hand.

## 1. Page transitions

**Options:**
- **A. A client router for pages without islands.** Rejected: it ships JS to pages that have no behaviour,
  against principle 8.
- **B. `<meta name="view-transition">`.** Rejected: that was an early draft of the spec, and Chrome removed it.
- **C. The CSS rule `@view-transition { navigation: auto }`.**
  - The browser keeps the old page on screen until the new one can render, then cross-fades.
  - It needs no JS, and it is supported by Chrome/Edge 126+ and Safari 18.2+.
  - Other browsers ignore it and keep today's behaviour.
- **D. C, behind a new project option.** Rejected: CSS already has the canonical way to change it.

**Decision: C, as a default emitted by `@hozu/css`.**
- `compileStyles` puts the rule before the project's stylesheet, with a `prefers-reduced-motion` rule that turns
  the animations off. The transition itself stays, so the page swaps without a blank frame.
- A project that wants no transition writes `@view-transition { navigation: none; }` in its own CSS. The later
  rule wins, so there is one way to change it and no new option.
- Custom animations use the standard `::view-transition-*` pseudo-elements.
- Soft navigation (ADR 0015) runs inside one document, so the rule does not affect it.

## 2. Static files that pages link to

**Decision:**
- `staticFiles` (used by `exportStatic` and by `hozu build` for `dist/public`) now also writes the generated
  files:
  - `/manifest.webmanifest` whenever `site` is set;
  - `/sw.js` and `/_hozu/sw-register.js` whenever `site.offline` is set.
- They use the same functions as the handler, so their content cannot drift.
- **Test:** every local `href`/`src` in the exported HTML of the blog and the cart must exist as a file.

## 3. `head.image` accepts an asset

**Decision:**
- `HeadFields.image` is `Val<string | null> | Asset`. The IR does not change: the builder still stores the
  hashed URL as a literal, and static export copies the file with the other assets.
- The reference documents it.

## Principle check
- **Principle 8:** unchanged. Pages without islands still ship 0 JS; the transition is CSS.
- **Principle 1:** one way to turn transitions off (CSS), and one way to give a page image (a URL or an asset,
  both through `head.image`).
- No new diagnostic, so no registry change.

## Verification
- `@hozu/css` output contains the default before the project's rules, and a project rule can override it.
- The static exports of the cart and the blog contain every file their HTML links to.
- A page whose `head.image` is `ui.asset(...)` renders an absolute `og:image`, and the static export copies it.
- The site drops its workarounds (the hand-written manifest and the copied icon), and its export audit passes.
- Gate green.
