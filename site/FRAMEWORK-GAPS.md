# Framework gaps

Gaps found while building this site. Resolved ones stay listed with the release that fixed them.

## Local assets in head.image (resolved in 0.4.0, ADR 0032)

- Needed: use the copied local icon as the social image through the asset pipeline.
- Was: `head.render: () => ({ image: ui.asset(...) })` failed with `TS2322: Type 'Asset' is not assignable to type 'Val<string | null>'`.
- Now: `head.image` accepts `ui.asset(...)`; the page links it by absolute URL and the export copies it.

## Static export omits the linked web manifest (resolved in 0.4.0, ADR 0032)

- Needed: every local URL linked by exported HTML must exist on GitHub Pages.
- Was: every page linked `/manifest.webmanifest`, but the export did not write it, and nothing reported it.
- Now: static exports and `hozu build` write the manifest (and the service worker files with `site.offline`).

## Pages flash on every link (resolved in 0.4.0, ADR 0032)

- Found after deploying: pages without islands load a new document per link, and browsers paint a blank frame.
- Now: the stylesheet turns on cross-document view transitions (Chrome/Edge 126+, Safari 18.2+), with no JS.


## Conditional code-copy island preloads JavaScript on pages without code (resolved in 0.4.2, ADR 0036)

- Needed: a typed clipboard widget with an idle → copied → idle machine and a 2000 ms timer, included only when a Markdown page contains code blocks.
- Attempt: a public/static query returns a list of code blocks. A machine-bound view renders `ui.each(blocks, 'id', block => ui.use(W, ...))`. The widget uses `implement<typeof W>`, `navigator.clipboard.writeText` and a typed success event. Contracts describe the event and timed reset. The query returns an empty list for the no-code reproduction.
- Exact observed result: the no-code page renders `<main><h1>Page without code</h1><div></div></main>`, but its head still contains `<link rel="modulepreload" href="/_hozu/client.js">`. Static export reports `skipped: []` and writes the client runtime and chunks. There is no framework diagnostic for this JS boundary mismatch.
- Decision: stop after this reasonable attempt, as requested. Do not ship the copy widget or its machine. All code remains selectable and keyboard-scrollable; every production page in the initial static phase remains at 0 client JavaScript bytes. A later user-approved phase adds an explicitly interactive overview route; it does not change this conditional clipboard limitation. The public render plan is derived for the route, not each query's eventual content.
- Reproduction during this phase: `.tmp/site-v2/copy-probe/`, with rendered output in `result.log`. No framework source was read or modified.

## SVG role attribute rejected (resolved in 0.4.1, ADR 0035)

- Needed: an explicitly named image role on the pipeline/render-plan SVG diagrams.
- Attempt: `ui.svg({ role: 'img', 'aria-label': '…', viewBox: '…' }, children)`.
- Exact diagnostics: `TS2353: Object literal may only specify known properties, and 'role' does not exist in type 'Props<"svg">'`; `HZ014: Attribute "role" is not allowed on <svg>`.
- Supported design: omit the rejected role. Keep an accessible `aria-label`, real SVG text labels, and the explanation in adjacent semantic HTML. Narrow screens receive a vertical SVG with readable labels. No unsafe cast or framework change is used.

## No noscript builder for the interactive lab (resolved in 0.4.1, ADR 0035)

- Needed: a fallback message for visitors with JavaScript disabled on the explicitly interactive overview.
- Attempt: `ui.noscript({}, children)` alongside the pipeline.
- Exact diagnostics: `TS2339: Property 'noscript' does not exist on type …`; `HZ014: ui.noscript is not a function` and `HZ014: Invalid view child`.
- Supported design: show the short JavaScript requirement and link to the static chapters for everyone. The explanatory content and chapter links remain available without JavaScript. No framework source was read or changed.
