# Site v2 review

## Changes

The header is now 61 px tall at 375, 768 and 1280 px. How it works has an ordered overview and six sourced articles. Pipeline stages and render-plan inputs are interactive native radio groups: they work with JavaScript disabled. No framework package was changed.

| New page | Prose words |
| --- | ---: |
| `/how-it-works/why-ai-first` | 737 |
| `/how-it-works/pipeline` | 727 |
| `/how-it-works/machines-and-contracts` | 668 |
| `/how-it-works/derived-rendering` | 731 |
| `/how-it-works/framework-owned-data` | 747 |
| `/how-it-works/trade-offs` | 786 |

Counts exclude front matter and fenced code, then split the remaining Markdown on whitespace. The overview is `/how-it-works`. Claims link to the repository ADRs and trials, including the qualifications about reused Nuxt measurements. Original trial and changelog Markdown stays in its original location.

Changed files:

- `content/how-it-works/*.md`: six new explanations with real Hozu API excerpts and source links.
- `content/docs/*.md`: related design-reading links in all nine documentation pages.
- `features/content/model.ts`, `server.ts`, `routes.ts`, `hozu.config.ts`: collection queries, heading metadata, source links, entries and new routes.
- `features/content/articles.ts`, `chrome.ts`, `diagrams.ts`, `views.ts`: shared reading layouts, compact navigation, native interactive SVG explanations and the revised home page.
- `app.css`: responsive spacing, dark colours, code highlighting, focus rings, native controls and view transitions.
- `highlight.ts`, `package.json`, `../pnpm-lock.yaml`: build-time-only Highlight.js core with four registered languages; no browser bundle.
- `verify.ts`: new routes, source coverage, navigation, anchors and zero-JS checks.
- `FRAMEWORK-GAPS.md`, `README.md`, this review, and `../docs/adr/0033-site-reading-experience.md`: decisions and verification evidence.

The existing Pages workflow and export entry remain in use. No new workflow, external service, client library, analytics or font request was introduced.

## Audit and fixes

The baseline audit used home and Getting started at 375, 768 and 1280 px, in light and dark modes.

| Finding | Change |
| --- | --- |
| Header consumed about 133 px on mobile and 95 px on wider screens | Compact 61 px header, 28 px logo, single desktop navigation row |
| Mobile navigation and documentation lists crowded the beginning of the page | Native details/summary menu and collapsible chapter navigation |
| Dark preference still produced a white page | CSS colour variables respond to the system colour scheme |
| Long articles lacked a heading index and source editing link | Markdown-derived table of contents, sticky desktop navigation, edit links and ordered previous/next links |
| Code had no syntax colour or language label | Build-time highlighting, labels, keyboard-focusable horizontal code scrolling |
| Home did not clearly connect onboarding, design and evidence | Stronger heading hierarchy, Docs → How it works → Trials links, evidence links and explicit limits |
| Desktop diagrams would become too small on phones | Separate vertical SVG layouts with readable text |
| Documentation and home spacing felt inconsistent | Shared type scale, content widths, spacing and theme colours |

All 18 final page/theme/width screenshots show no horizontal page overflow. The desktop header/sidebar have separate view-transition names; reduced-motion media rules disable transition animations. Focus rings remain visible. Tested text, muted text, link and syntax colours have a minimum contrast ratio of 5.68:1 across their intended light/dark backgrounds, above the 4.5:1 AA normal-text threshold. This is a palette check, not a claim of a complete accessibility certification.

Screenshot review led to the narrower header, stacked onboarding layout at tablet widths, collapsed mobile reading navigation and vertical mobile diagrams. The additional interactive-state screenshots confirmed the selected-state outline, readable result panels and two-column mobile menu.

## Screenshots reviewed

Local evidence is under `.tmp/site-v2/` (ignored build/audit output). Baseline: `before/{home,docs}-{375,768,1280}-{light,dark}.png` (12 files).

Final screenshots under `after/`:

| Page | Light | Dark |
| --- | --- | --- |
| Home | `home-375-light.png`, `home-768-light.png`, `home-1280-light.png` | `home-375-dark.png`, `home-768-dark.png`, `home-1280-dark.png` |
| Getting started | `docs-375-light.png`, `docs-768-light.png`, `docs-1280-light.png` | `docs-375-dark.png`, `docs-768-dark.png`, `docs-1280-dark.png` |
| Pipeline | `how-375-light.png`, `how-768-light.png`, `how-1280-light.png` | `how-375-dark.png`, `how-768-dark.png`, `how-1280-dark.png` |

Additional reviewed states: `pipeline-interactive-375-dark.png`, `render-interactive-375-dark.png`, `menu-375-dark.png`. The element screenshots include the sticky header overlay when scrolled; the full-page screenshots document the complete layout.

## Verification

Node 22.22.2 was used. Only a static Python server served `site/dist` on port 4799; no development server was started. The static server was stopped by PID 76359 after inspection.

- `pnpm gate`: passed once for this phase; lint and typecheck clean, 46 test files passed (2 skipped), 264 tests passed (4 skipped), all benchmark budgets passed.
- `pnpm --filter hozu-site check`: types OK, 0 errors, 0 warnings, contracts 0/0, lock checked. Production has no machines and therefore no uncovered machine transitions.
- CLI `hozu get --json`: home, overview, all six chapters, Getting started, trial 0012 and changelog return 200; a missing page returns 404. `verify` additionally checks expected text and missing collection slugs.
- `pnpm --filter hozu-site export`: 40 exported files, 0 skipped routes, followed by CNAME and `.nojekyll`.
- `pnpm --filter hozu-site verify`: 34 HTML files, 32 canonical sitemap URLs under `https://hozu.org`; every local link, fragment and asset resolves. CNAME, `.nojekyll`, `404.html`, manifest, static share image and collection coverage pass.
- Browser with JavaScript disabled: mobile menu opens, pipeline radios respond to arrow keys, and all eight scope/freshness combinations select exactly one correct result panel.
- `hozu plan` for home and documentation: `assert: static`, `cacheable: true`, `islands: []`, `js: false`. No exported script files or module preloads exist.

| Page type | Client JavaScript |
| --- | ---: |
| Home | 0 B |
| Docs | 0 B |
| How it works overview and articles | 0 B |
| Trials index and articles | 0 B |
| Changelog and missing page | 0 B |

## Framework feedback

Two new entries are recorded in `FRAMEWORK-GAPS.md`:

1. The clipboard prototype declared a typed widget, idle/copied machine, 2000 ms reset and transition contracts. An empty query rendered no widget but still produced a `client.js` module preload. There was no framework diagnostic. Following the requested one-attempt limit, the site ships selectable code without a copy button, preserving the per-page zero-JS boundary.
2. `role: 'img'` on `ui.svg` produced TS2353 and HZ014. The supported diagrams retain aria labels, SVG text and adjacent semantic HTML without the rejected attribute.

Full needs, attempts and exact diagnostics are in the gap log. The native interactive explanations require neither workaround nor client library.
