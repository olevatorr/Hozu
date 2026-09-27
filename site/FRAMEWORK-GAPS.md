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
