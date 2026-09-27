# ADR 0035 — 0.4.1: `role` on SVG, `ui.noscript`, and widget documentation

- Status: accepted (the user approved 0.4.1)
- Motivation: the second version of the official site (`site/FRAMEWORK-GAPS.md`) and an outside user found three
  gaps.
  1. **`<svg role="img">` was rejected** (TS2353 and HZ014). `role` was added to the HTML globals by
     `scripts/gen-dom.ts`, but not to the SVG globals. ARIA allows `role` on SVG elements; a diagram needs it to be
     announced as one image.
  2. **`ui.noscript` did not exist,** although views claim every HTML element. The site had to show "needs
     JavaScript" to every visitor.
  3. **Agents looked for a `widget` export from `@hozu/core`.** The API is `ui.widget`, but the skill mentioned it
     in one line; the full shape (declaration, `ui.use`, client module, bundling) was only in the repository's
     `CLAUDE.md` and `examples/showcase`, which apps created by `create-hozu` do not have.

## Decision
- **`role` on SVG elements:** `gen-dom.ts` adds `role` to the SVG globals, as it already did for HTML. The values
  stay a free string, as on HTML.
- **`noscript`:** added to the generated HTML tags, with no attributes of its own. The server renders it like any
  element. Inside an island the client creates it too, and browsers do not render its content while scripting is on,
  so there is nothing to special-case.
- **Widgets:** `reference.md` gets a Widgets section that says there is no `widget` export and shows the whole path.
  Principle 1 rules out adding `widget` as a second name.
- **Not in 0.4.1:** a machine-bound view makes its route load the client runtime even when its island renders
  nothing. The render plan is derived per route, not per query result, so this needs its own ADR.

## Verification
- A builder test uses `ui.svg({ role: 'img', 'aria-label' })` and `ui.noscript` without casts and expects no
  diagnostics. Server output: `<noscript>…</noscript><svg role="img" …>`.
- The site uses both. In Chrome, the `noscript` note has a layout box without JS, and none with JS. The four
  diagrams are exposed as images by name.
- The widget section was checked on a copy of `examples/bookmarks`: `tsc`, `hozu validate` and `bundleWidgets` are
  clean.
