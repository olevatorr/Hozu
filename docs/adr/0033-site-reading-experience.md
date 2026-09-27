# ADR 0033 — Site reading experience and design explanations

- Status: accepted for implementation by the site-v2 request
- Scope: one site-only phase; no framework package changes

## Options

1. Add a client router, theme switcher and documentation library. This would ship JavaScript for content-only navigation and introduce unnecessary dependencies.
2. Keep native document navigation and progressively enhance only code copying. Native details/summary provides the mobile menu; CSS controls colour schemes, layout and shared-element transitions.

## Decision

Choose option 2. Preserve the existing blue/ink visual language, reduce the header to a compact single row, and make reading navigation subordinate to the article. Use CSS variables for light/dark colours, accessible focus rings and reduced motion. Two inline SVG diagrams describe the compilation pipeline and derived render plans with real text labels.

A new ordered Markdown collection owns six How it works chapters and an overview. Both guide collections use Markdown heading metadata for table-of-contents anchors, source edit links and ordered previous/next links. Original trials and changelog remain their single sources of truth. Build-time highlighting uses a small highlighter and ships only span markup and CSS.

Attempt one typed widget with a clipboard client implementation and an idle/copied machine with a 2000 ms reset and contracts. Mount only on code blocks. If the public API cannot meet static-export or per-page JS constraints after one reasonable attempt, record its exact failure and retain selectable static code blocks as explicitly authorized.

## Implementation and verification

1. Audit home/docs at 375, 768 and 1280 pixels in light/dark; record baseline screenshots and problems.
2. Add sourced articles, routes, content metadata and shared article layout. Improve header, navigation, typography, themes and diagrams.
3. Attempt the copy interaction; verify every transition and exported JS boundaries, or record the fallback.
4. Run Hozu checks, all new requests, complete export/link/heading audits and render plans. Inspect screenshots of home/docs/How it works at all three widths and both themes using only a static server on 4799; stop it by PID.
5. Run the repository gate once, report unstable metrics without rerunning benchmarks, and commit on site-v2 without pushing.

The site remains the runnable app for this site-specific phase rather than introducing a duplicate under examples/.

## Follow-up requirement

The user requested interactive explanations during implementation. Native radio groups now select pipeline stages and compare public/user scope with static/revalidate/SWR/live freshness. CSS reveals the corresponding explanation; no application state, effects or JavaScript are needed. This is separate from the clipboard widget attempt, whose per-page preload limitation is recorded in the gap log.
