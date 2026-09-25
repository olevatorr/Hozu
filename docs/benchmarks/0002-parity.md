# Benchmark 0002 — visual parity with Nuxt

Run with `pnpm bench:parity` (local only, not part of `pnpm gate`). Source: `bench/parity`, `examples/showcase`.

## Setup
The same page is built twice:
- **Tenon**: `examples/showcase`. It has a single feature with a machine, two queries and six widgets: three.js
  globe, GSAP ScrollTrigger reveal, Lenis smooth scroll, Swiper carousel, Chart.js chart and p5 sketch. It uses
  Tailwind v4 with the typography plugin, dark mode, responsive layout, tabs with fade motion, a task list with
  enter/leave/move motion and native form validation, and cross-document View Transitions.
- **Nuxt 4.5**: `bench/parity/nuxt`. The markup is hand-written in Vue with the same classes, the same `app.css`,
  the Tailwind v4 Vite plugin, and the **same widget modules**, mounted from a small `Widget.vue`.

Chromium 140 (Playwright) with `reducedMotion: 'reduce'`, so both pages settle deterministically. Canvases (three.js,
Chart.js, p5) are masked because they animate. Viewports 375 / 768 / 1440 px, light and dark, in four states:
initial, hover (feature card), focus (text input), and interacted (tab switched, task added, metric changed).

## Results (2026-09-25)
Pixel difference between full-page screenshots (pixelmatch, threshold 0.1). Noise floor, measured as the same
framework loaded twice: **0.000%**.

| Viewport | Light: initial / hover / focus / interacted | Dark: initial / hover / focus / interacted | Page height (Tenon = Nuxt) |
|---|---|---|---|
| 375 | 0.000% / 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% / 0.000% | 3609, 3675 after interaction |
| 768 | 0.000% / 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% / 0.000% | 2764, 2796 |
| 1440 | 0.000% / 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% / 0.000% | 2722, 2754 |

**All 24 comparisons are pixel-identical.**

| | HTML | CSS | JS (incl. lazy widget libraries) | DOMContentLoaded | load | CLS |
|---|---|---|---|---|---|---|
| Tenon | 27.3 KB | 42.4 KB | 671 KB | 27 ms | 43 ms | 0 |
| Nuxt 4.5 | 12.1 KB | 42.0 KB | 2,870 KB | 79 ms | 79 ms | 0 |

Single run on a shared container; timings vary by about ±30%.

## What the first runs found (fixed)
1. **Sub-pixel text differences (0.04–0.13%)**. Nuxt's CSS pipeline (cssnano) folds `calc(1.25 / .875)` in
   Tailwind's line-height tokens to `1.42857`, while Tenon kept the `calc()`. Line boxes then differed by
   1/64 px, which moved glyph anti-aliasing. `@tenon/css` now folds literal divisions the same way.
2. **HTML was 39.5 KB**. A wrapper widget at the page root (Lenis) turned the whole page into one island, so
   the whole view IR was shipped. The children of a root wrapper widget now stay outside its island, and only
   their own islands hydrate. That brought it to 27.3 KB.

## Reading the numbers
- Visual output is determined by HTML + CSS, and Tenon now produces the same rendering as Nuxt for the same markup
  and stylesheet, including third-party library DOM (Swiper) and hover, focus and dark states.
- The HTML is larger because interactive islands ship their view nodes in the JSON payload. Nuxt ships the
  equivalent information as compiled JavaScript. Compacting the payload encoding is an open optimization.
- The JS difference comes mostly from bundling. Tenon's widget modules are split per widget, loaded only when
  visible, and share chunks. The runtime itself is 7.0 KB gzipped.
