# ADR 0009 — Presentation parity: full DOM vocabulary, styling, motion, widgets

- Status: accepted (2026-09-25; the user approved all steps and allowed binding Tailwind directly). Amendments below.
- Trigger: sites built with Tenon are for people. Anything a Nuxt/Vite + Tailwind site can show (CSS, responsive
  layout, hover/focus states, transitions, scroll effects, three.js, GSAP, Lenis, Swiper, Chart.js, p5) must look
  and feel identical. Tenon's advantage is for the author (an AI): fewer tokens to read, invalid programs hard to
  express, valid ones cheap to verify. It must not cost the reader of the site anything.

## Context: what blocks parity today
| Area | Today | Consequence |
|---|---|---|
| Tags | 31 HTML tags | no `input`, `select`, `textarea`, `svg`, `video`, `picture`, `dialog`, `details`, … |
| Attributes | 15, untyped per tag | no `data-*`, most `aria-*`, `srcset`, `loading`, `width/height`, `placeholder`, … |
| Events | `click`, `submit`; no event data | no forms, keyboard, pointer, scroll-linked input |
| Classes | static string only | no active tab, open menu or selected-item styling |
| Style | none | no dynamic values (progress bars, positions) |
| Stylesheets | none | no CSS pipeline at all, no Tailwind |
| Hydration | replace (render + swap) inside `<t-i style="display:contents">` | CSS transitions restart, focus/video/scroll state lost; the wrapper breaks `ul > li`, `:nth-child`, `:first-child` |
| Lists / `when` | a region is cleared and re-rendered when its key changes | no enter/leave/move animation; elements that GSAP targets are recreated |
| Imperative libraries | impossible (principle 4) | no three.js, GSAP, Lenis, Swiper, Chart.js, p5 |

## Guiding rule
**Structure and behavior stay in the IR (checked). Pixels stay in CSS (standard). Imperative drawing goes into
widgets (typed boundary, opaque body).** Each of these is the most widely known form of its concern, so an AI
writes what it already knows, and the IR records only what it can check.

## D1 — Complete, typed DOM vocabulary
- Tags: every HTML living-standard element, plus SVG. `script`, `style`, `iframe` with `srcdoc`, and `on*`
  attributes stay excluded; they have canonical replacements (widgets, stylesheets).
- Attributes are typed **per tag**, generated at build time from a vendored copy of the spec data (no runtime
  dependency). The type lookup is a plain interface keyed by tag, which keeps the A4 cost down. `data-*` and
  `aria-*` are always allowed; their values are `Val<string | number | boolean | null>`.
- Events: every standard DOM event. A handler is still only `ui.send(Event, payload)`. The payload may read a
  closed set of **DOM fields** through a new value source `{ ref: 'dom', path }`: `value`, `checked`,
  `valueAsNumber`, `files` (as metadata), `key`, `code`, modifier flags, `clientX/Y`, `deltaY`, `scrollTop`,
  `scrollY`, `width`/`height` (resize). Reading a field that the event type does not have is **TN027**.
  `submit` always calls `preventDefault`; other defaults are kept.
- Forms: the canonical form is controlled. `value` / `checked` attributes are bound to context, and `input`
  sends an event. There is no two-way binding sugar (principle 1). Browser-native validation attributes
  (`required`, `pattern`, `min`, …) are ordinary attributes.

## D2 — Hydration fidelity (prerequisite for everything visual)
Options: (a) keep replace-hydration, (b) adopt existing DOM, (c) resumability (Qwik-style).
**Chosen: (b).**
- The client walks the server DOM of each island along the same IR and attaches bindings and listeners. No
  element is recreated, so running CSS transitions, focus, `<video>` playback, scroll position and widget hosts
  survive hydration.
- The `<t-i>` wrapper is replaced by comment markers (`<!--i:3-->…<!--/i-->`). This restores exact CSS selector
  semantics and removes the `display: contents` layout caveat.
- Server and client render the same IR from the same data, so a mismatch indicates `fn` impurity. Dev builds
  compare and report it as a diagnostic; production trusts the server.
- `each` becomes keyed reconciliation: insert, remove and **move** without recreating unchanged items. The
  key is already required.

## D3 — Styling
### D3.1 Stylesheets: explicit files
Options: (a) CSS-in-TS objects, (b) scoped `<style>` blocks, (c) plain CSS files declared explicitly.
**Chosen: (c).** It covers everything CSS can express (media/container queries, `:has`, layers, nesting,
`@keyframes`, dark mode, `view-transition-name`), and it is what models know best.
```ts
feature({ id: 'cart', styles: [new URL('./cart.css', import.meta.url)], … })
project({ css: tailwind({ entry: new URL('./app.css', import.meta.url) }), … })
```
- `styles` is explicit per feature (principle 2: no auto-import). The file path is resolved by the platform
  (`new URL`), not by a string convention.
- The server links the CSS of exactly the features rendered on a page (derived, like JS). Critical CSS for the
  first region is inlined when it is small; this is a derived optimization, not an option.
- **One CSS adapter per project**, like schemas: `@tenon/css-tailwind` (Tailwind v4) is the default. Plain CSS
  (plus Lightning CSS for nesting and prefixing) is the built-in fallback. Sass or PostCSS go through an adapter.

### D3.2 Classes are validated
Every class string is static in the IR, so the complete candidate set is known. The CSS adapter answers "which of
these classes produce CSS?": Tailwind v4 compiles exactly the candidates (no file scanning), and plain CSS
extracts class selectors. An unknown class is **TN026**, with the nearest match as the fix (`bg-rde-500` →
`bg-red-500`). Today an AI can only catch this kind of mistake with a screenshot.

### D3.3 Dynamic classes and values
- `class: 'static string'` stays as it is.
- `toggle: { 'bg-blue-600 text-white': op.eq(ctx.tab, 'specs'), 'opacity-50': p.soldOut }`: each class group
  is switched on by a guard (`GuardExpr`, or a boolean `Val`). The candidate set stays static and validated.
- `vars: { '--progress': ctx.percent, '--x': p.offset }` binds **CSS custom properties** only. CSS decides what a
  value means (`width: calc(var(--progress) * 1%)`). There is no free `style` object, so there is one canonical
  way to style (principle 1).

## D4 — Motion
- **Enter / leave / move** on `when` and `each`:
  `ui.when(['open'], children, { motion: 'fade' })`. The runtime applies the classes `fade-enter-from`,
  `fade-enter-active`, `fade-enter-to` (and the matching `leave` / `move` classes, FLIP for move), waits for
  `transitionend` / `animationend`, then removes the element. The animation itself is plain CSS (or Tailwind),
  following the well-known Vue convention.
- **Page transitions**: client-side navigation between pages of the same project (fetch HTML, swap `<body>`
  regions, keep the payload rules). When the browser supports it, the swap is wrapped in
  `document.startViewTransition`, so `view-transition-name` in CSS drives shared-element transitions.
  `prefers-reduced-motion` is respected by default.
- Anything timeline-based or scroll-scrubbed (GSAP, ScrollTrigger) is a widget (D5).

## D5 — Widgets: the typed escape hatch for imperative libraries
Options: (a) allow arbitrary components, (b) framework-specific bindings per library, (c) a typed boundary with
an opaque client module. **Chosen: (c).**
```ts
// features/hero/globe.ts: the boundary. This is all an AI must read to use it.
export const Globe = ui.widget({
  props: z.object({ points: z.array(Point), spin: z.boolean() }),
  events: { Picked },
  client: new URL('./globe.client.ts', import.meta.url),
  load: 'visible',
})
// in a view
ui.use(Globe, { props: { points: data.points, spin: op.eq(ctx.mode, 'auto') }, on: { Picked: SelectPoint },
                class: 'aspect-square w-full' }, [/* server-rendered fallback / wrapped children */])
```
```ts
// globe.client.ts: arbitrary code (three.js, GSAP config from utils/, …)
export default implement(Globe, ({ el, props, emit, signal }) => {
  const renderer = new WebGLRenderer({ canvas: el.appendChild(document.createElement('canvas')) })
  return { update(next) { … }, destroy() { renderer.dispose() } }
})
```
- **Leaf widgets** (three.js, Chart.js, p5, maps) own the inside of their host element. The server renders the
  host with its classes, so layout is reserved (no CLS), plus optional fallback children for SEO and no-JS.
- **Wrapper widgets** (GSAP / ScrollTrigger, Lenis, Swiper) receive Tenon-rendered children. They may change
  styles, classes and attributes, and may add their own nodes, but they must not remove nodes that Tenon owns.
  Dev builds check this with a `MutationObserver`. Page-wide behaviors (Lenis smooth scroll) are a wrapper widget
  around the page root, declared in the page, not injected globally.
- Props are schema-typed `ValueExpr`s, so they are reactive: `update` is called when a prop changes. Events are
  declared `event()`s and go through the machine, so TN005 (event legal in visible states), contracts and
  `simulate` cover them like any button. The widget's behavior toward the app stays inside the contract world.
- A widget is always an island. Its module is code-split and loaded by `load: 'eager' | 'visible' | 'idle'`.
  Default `visible`; this is a declared hint the compiler validates, like `assert`.
- The IR stores the boundary and the module's source hash. `tenon inspect` shows only the boundary. A changed
  hash is reported as a **visual change** (listed in `validate`, not a behavior change: principle 5 is about the
  machine).
- Principle 4 amendment (needs approval): *"Views are constrained `ui()` trees, never arbitrary functions.
  Imperative rendering is allowed only inside declared widgets: a schema-typed props/events boundary around an
  opaque client module."*

## D6 — Assets and fonts
`asset(new URL('./hero.jpg', import.meta.url))` gives a hashed URL. `img` requires `width` / `height` (TN028, to
prevent CLS). Fonts come from `@font-face` in CSS. `<link rel="preload">` for fonts and the LCP image is derived
from the stylesheet and the first region. There is no manual head tag list (ADR 0008 stays closed).

## D7 — Build tool
Options: (a) extend our esbuild setup, (b) Vite plugin, (c) Rolldown directly. **Chosen: (b) `@tenon/vite`.**
It gives Tailwind v4, Lightning CSS, Sass, CSS HMR and code-split widget bundles for free, which is the workflow
Nuxt users know. The IR toolchain stays zero-dependency: `@tenon/core`, `validator`, `cli`, `machine`, `data`,
runtimes. Vite is used only for dev and asset build. Editing a `.css` file hot-swaps styles; editing a feature
rebuilds the IR and reloads the affected islands.

## AI cost (why this stays cheap for the author)
- The visual layer is written in the two most-trained vocabularies: HTML attributes and Tailwind/CSS. Nothing
  new to learn there.
- TN026 turns "wrong class", which needs a screenshot today, into a JSON diagnostic with a fix.
- A 300-line three.js file is not in the context an agent needs for page logic. The agent reads a ~10-line
  widget boundary, and `inspect` / `graph` never expand widget bodies.
- Reported metric **A7**: for the showcase (below), the bytes an agent must read to change one behavior, Tenon
  (`inspect` + feature file) vs the Nuxt reference (the components involved).

## Acceptance: the showcase and the visual parity check
`examples/showcase`: a product landing page plus a small app section: Tailwind v4 with dark mode and responsive
layout, hover and focus states, a tab switch with CSS transitions, a list with enter/leave/move animation, a
form with native validation, a three.js hero, GSAP ScrollTrigger sections, Lenis smooth scroll, a Swiper
carousel, a Chart.js chart and a p5 sketch.
A **Nuxt reference** of the same page with the same CSS lives in `bench/parity` (local only, no CI):
- Playwright screenshots at 375 / 768 / 1440 px, light and dark, in hover, focus and post-interaction states:
  pixel diff ≤ 0.1% (canvas contents excluded, compared by "rendered and animating").
- CLS = 0; transitions and animations observed (computed style over time) match.
- Report: JS bytes, time to interactive, and A7.

## Budgets and principles affected (need approval)
| Item | Change |
|---|---|
| Principle 4 | amendment above (widgets) |
| Zero-dependency rule | exceptions: `@tenon/css-tailwind`, `@tenon/vite` (as for `@tenon/schema-zod`) |
| P7 `runtime-client` ≤ 5 KB | → **≤ 7 KB** (keyed `each` + adoption + motion + widget loader). Widget code is not counted; it is the user's |
| A4 type instantiations ≤ 50k (at 47.3k) | per-tag attribute typing may exceed it; measure first and raise it with evidence, not silently |
| A3 exports ≤ 15 (at 15) | unchanged: `ui.widget`, `ui.use`, `asset` under `ui`; `implement` from `@tenon/core/widget` |

New codes, each with a registry entry, rule, fix and mistake-catalog case: TN026 unknown-class, TN027
invalid-dom-field, TN028 image-without-dimensions, TN029 widget-boundary-mismatch (the module does not
`implement` the declared widget, or the declared file is missing).

## Delivery (one approval per step, gate green and example runnable at the end of each)
| Step | Content | Ends with |
|---|---|---|
| 5a | D1 vocabulary + DOM fields + forms, D2 adoption hydration, comment markers, keyed `each` | cart gets a quantity form; bench rerun |
| 5b | D3 stylesheets, `@tenon/vite`, Tailwind adapter, TN026, `toggle`, `vars`, CSS HMR | blog restyled with Tailwind |
| 5c | D4 enter/leave/move motion, client navigation + View Transitions | animated list and page transitions |
| 5d | D5 widgets (leaf + wrapper), D6 assets | three.js, GSAP, Lenis, Swiper, Chart.js, p5 examples |
| 5e | showcase + Nuxt reference + visual parity report | parity report in `docs/benchmarks/0002-parity.md` |

## Out of scope (still)
Arbitrary functions as views, a free `style` object, global stores, `<script>` in views, runtime CSS-in-JS.

## Amendments during implementation

### 5a
- `ui.dom.form('name')` instead of `ui.dom.form.name`: under `noUncheckedIndexedAccess` a record field reads as
  `Ref | undefined`, which would force a non-null assertion on every form field.
- `textarea` takes no children (its content is the `value` attribute), like void elements.
- Per-tag props are generated interfaces (`builders/dom-props.ts`), not mapped types: type instantiations for the
  cart dropped from 56.3k to 47.7k, back under the A4 budget.
- Empty dynamic texts have no server text node; hydration inserts an empty one. Text separators (`<!---->`) are
  emitted only between two text nodes inside an island.

### 5b: Tailwind is bound, no adapter layer, no Vite
- The user allowed binding Tailwind directly with performance first. `@tenon/css` compiles Tailwind v4
  (`@tailwindcss/node`) from **exactly the class candidates in the IR**, with no file scanning. The output
  selectors give the set of valid classes (TN026) with no second pass. Compile + build + minify takes ~35 ms.
- **One stylesheet per site** (`/_tenon/styles.<hash>.css`, immutable cache), not per page as D3.1 said: atomic
  CSS is small, and one cached file beats a different file per page. Feature `styles` are still declared per
  feature and imported after the project entry.
- Style files live in build bindings (`bindings.styles`), not in the canonical IR, so IR hashes stay
  machine-independent.
- D7 changes from Vite to **esbuild + `@tenon/dev`** (no third-party dependencies): the dev server runs the app,
  proxies it, hot-swaps stylesheets on `.css` changes (page state is kept) and reloads on code changes. Tailwind
  already includes Lightning CSS; esbuild (5d) bundles widgets.
- `tenon validate` checks classes when `@tenon/css` is installed in the project. It keeps a content-keyed cache
  (class candidates + every CSS file involved) in `node_modules/.cache/tenon`, so cold validation stays under the
  P3 budget.
- Class names are for styling. Script hooks use `data-*` attributes, so a class without CSS is always a mistake.
