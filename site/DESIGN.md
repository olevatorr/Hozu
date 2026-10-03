# hozu.org for 0.9 — design

**Status:** proposed, 2026-10-01; the owner decided every point below in the design dialogue.

**Goal:** a new site for Hozu 0.9 that keeps a reader from the first screen to the evidence.
- The first screens are for designers and vibe coders with little programming background. Each section further down is
  more technical.
- The message stays verification. It says honestly that Hozu costs more tokens, and shows what those tokens buy.
- The site is built from 0.9 components, and says so.

## Scope
- **Rewritten in place on the branch `site-0.9`.** Every view, the stylesheet (`app.css`, 1 451 lines), `diagrams.ts`
  and the review records of the old site (`REVIEW.md`, `INTERACTIVE-REVIEW.md`) are replaced or deleted. Nothing of
  the old design is kept.
- **Kept, because they are content and plumbing, not design:**
  - the content sources: `content/docs/*.md`, `content/how-it-works/*.md`, `../docs/trials/*.md`, `../CHANGELOG.md`;
  - the routes (`/`, `/docs/:slug`, `/how-it-works`, `/how-it-works/:slug`, `/trials`, `/trials/:slug`, `/changelog`,
    `/404`), so existing links keep working;
  - `export.ts`, `verify.ts`, the Pages workflow, and the static deployment (no server, no analytics, no external
    fonts or requests).
- `FRAMEWORK-GAPS.md` is restarted for 0.9 (see "Framework gaps").
- **Out of scope:**
  - changing any `@hozu/*` package;
  - rewriting the Markdown content of docs, chapters or trials (only links and headings may be fixed);
  - a comparison page against other frameworks;
  - a blog.

## Readers, top to bottom
| Depth | Reader | Sections |
|---|---|---|
| 1 | Everyone: designers, vibe coders | 01 hero, 02 the bill, 08 start |
| 2 | Vibe coders who will try it | 03 how you work |
| 3 | Curious builders | 04 what it catches |
| 4 | Developers | 05 components, 06 under the hood, docs |
| 5 | Skeptics | 07 the trials, trial pages |

## Visual direction
- **Swiss poster**, from intro video v4:
  - off-white `#f1ede4`, ink `#111010`, signal red `#fb3a0e`, green `#2fa36b` for a passing check;
  - very large bold uppercase type, hard blocks, offset shadows, a faint vertical grid.
- **System font stacks only**, since the site loads no external fonts:
  - display: a heavy grotesque stack, e.g. `'Helvetica Neue', Arial, sans-serif` at weight 900;
  - text: the same stack;
  - code: `ui-monospace, Menlo, monospace`.
- **Motion language:**
  - kinetic headlines (words rise in);
  - blocks that assemble like a tenon and mortise;
  - an evidence ticker.
  - All of it is CSS. Under `prefers-reduced-motion` every animation stops in its final state, and the ticker can be
    paused.
- **Further down the page the poster calms down:** less motion, more monospace evidence. The trial pages read like
  records.

## Header
- **Elements:** the logo, then the **latest version** as a tag (`0.9.0`), then Docs, How it works, Trials, Changelog,
  GitHub and npm.
- **The version is derived, never typed:**
  - the export reads it from `packages/core/package.json`;
  - every published package shares that version;
  - verify fails when the tag differs from that version.
- **On a phone** the navigation collapses into a `<details>` menu, as now.

## Home page
Every section is a `Section` with a depth meter.

1. **Hero: "Your AI writes the app. Hozu checks it."**
   - The kinetic headline.
   - One line on the cost: "It costs more tokens than other frameworks. That is the price of a second pair of eyes on
     every change."
   - Two buttons: Start building, See the proof.
   - **The demo** shows a small notes app signed in as ada, with an **AI CHANGE** button:
     - Pressing it makes the list show one of bob's notes. The check output turns red: HZ049, user data would be
       cached and shown to another user.
     - **APPLY FIX** restores the list and a green `✔ types ok · 0 errors · lock current`.
   - **A 3D tenon joint** turns slowly. It splits apart when the change is wrong and snaps together when it is fixed.
   - The evidence ticker runs underneath.
2. **The bill: "Yes, it costs more. Here is the receipt."**
   - A receipt that lists what you pay, then what you get. Every line links to its source.
   - The counter-story:
     - in trial 0012 one Nuxt change silently broke three working features;
     - in trial 0020 Hozu 0.7 missed regressions too, and 0.8 fixed exactly that.
3. **How you work: "Three steps. Your agent does the typing."**
   1. Create: `npm create hozu@latest`.
   2. Ask your agent, which reads the guide that comes with the app.
   3. It checks itself with `hozu check`, and fixes what it finds before it says it is done.
4. **What it catches: "Mistakes that look fine and still break."**
   - Four flip cards: a plain-English story on the front, the real diagnostic (code, message, suggested fix) on the
     back.
   - The cards: user data on someone else's screen (HZ049), a form that drops what was ticked (HZ054), a route
     nothing serves (HZ052), and a behaviour change nobody reviewed (HZ057).
   - On the back, each code and its name come from the diagnostic registry (`codes` in `@hozu/core/ir`), not typed;
     the message and fix text are written by hand. Verify fails when a card's code is missing from the registry or
     its name differs.
5. **Components (0.9): "Declared UI. Checked class by class."**
   - A playground: pick a variant of a kit `Button` and see the rendered element, its `ui.component` source, and what
     `hozu render` prints.
     - The render output is a committed snapshot of `hozu render`, and a test fails when it is stale.
   - A short note explains class conflicts (HZ079) and links to the components docs.
   - The code shown next to the playground is the `Joint` declaration and an excerpt of its three.js module.
   - One line says this site is built from the same kit.
6. **Under the hood: "feature() → IR → validator → compiler → runtime"**
   - A new pipeline lab and render-plan lab: derived rendering, 0 JS by default, machines and contracts,
     framework-owned data.
   - Links to the six chapters.
7. **The trials: "Measured, with the rough edges included."**
   - The per-step curves of trials 0020 and 0021, and a table of 0.7 against 0.8.
   - The limits, stated plainly: one run, and the slope target not met.
   - Links to every trial.
8. **Start: "Build something. Then try to break it."**
   - The command, docs, GitHub and npm.
   - The ticker again.

## Claims and their sources
Only these numbers appear on the home page. Each one links to its source, and the copy never rounds in Hozu's favour.

| Claim | Value | Source |
|---|---|---|
| Tokens per change against Nuxt (0.8) | 1.34–1.72× (three accountings, steps 13–20) | trial 0021, one run |
| Regressions / silent failures over 16 changes (0.8) | 0 / 0 | trial 0021 |
| Regression failures on 0.7, same app | 8 (run 1), silent at 5 steps | trial 0020 |
| Tool calls over steps 13–28 | 270 against 193 | trial 0021 |
| Client JS on the notes list page | 24.0 KB against 233.9 KB | trial 0021, step 28 |
| One Nuxt change silently broke three working features | 72/72 against 67/72 checks | trial 0012 |
| Limits | one run per framework; log-ratio slope over 13–28 slightly positive (target ≤ 0, not met) | trial 0021 |

A number that is not in this table needs a source row before it goes on the site.

## Tone
The tone follows the reader's depth.

| Sections | Tone | Example |
|---|---|---|
| Hero, the bill, how you work | **A, frank and self-deprecating** | "Yes, Hozu eats more tokens. … Cheaper frameworks let your agent ship the bug and send you the invoice later." |
| What it catches, components | **B, plain and steady** | "You pay for the check up front instead of finding the breakage later." |
| Under the hood, the trials, docs and trial pages | **C, numbers first, with sources** | "Cost: 1.34–1.72× Nuxt's tokens per change (trial 0021, steps 13–20, one run)." |

**In every tone:**
- every number carries its source and scope;
- no promise beyond the evidence: "0 regressions in 16 changes", never "it never breaks";
- the site stays in English, like the repository.

## The `site` kit
- **Declaration:** `ui.kit({ id: 'site', components, styles })` in `project({ kits })`.
- **Styles:** each component's styles are a `tv()` result from `site/kit/tv.ts` (`hozu add kit`). Variants are
  literals.
- **The render is closed:** no `style`; dynamic values go through `vars`.

| Group | Component | Variants / props | Used by |
|---|---|---|---|
| Frame | `Header` | version tag, collapsing nav | every page |
| | `Footer` | — | every page |
| | `Section` | `tone: paper / ink`, `depth: 1–5` (meter) | home |
| Type | `Display` | `motion: rise / none` | headings |
| | `Kicker`, `Mono` | — | everywhere |
| Action | `Button` | `intent: solid / outline`, `size: md / lg` | hero, start |
| | `Tag` | `tone: red / ink` | version, section marks |
| Motion | `Ticker` | items, pausable | hero, start |
| | `Joint` | client component (three.js), props `{ split, model, poster }` | hero, components |
| Evidence | `Receipt` | lines with source links | the bill |
| | `CatchCard` | front story, back diagnostic (CSS flip on hover and focus) | what it catches |
| | `Steps` | — | how you work |
| | `StatTable` | — | the trials, trial pages |
| Reading | `Prose` | table of contents, previous / next | docs, chapters, trials, changelog |
| | `CodeBlock` | client component: the copy button (`load: 'visible'`) | pages with code |

## JavaScript budget
- **The home page runs one machine view and one 3D component; How it works runs the lab. Every other page ships
  0 KB,** except `CodeBlock`'s copy module on pages with code.
- **The 3D joint's bundle (three.js and its module) loads only on the home page, only when it scrolls into view,** and
  is at most 180 KB gzip. Verify fails when another page references it or the limit is passed. The framework's own
  budget P7 is unaffected.
- **Verify asserts the island list per page.**

## The 3D joint (amendment, 2026-10-02)
- **Shape:** a square H. Two posts, a beam whose ends are two through tenons, and two red pegs (込み栓) that lock them.
  It is not the logo's shape.
- **Style A:** paper `#f6f2ea` and sand `#e4d8c3` flat shading, thick ink outlines, red `#fb3a0e` pegs.
- **Poses:**
  - joined;
  - split: both pegs pop out, the posts slide apart and the tenons show.
- **Source:** `site/3d/joint.py`, a Blender 5.2 script run headless (`blender -b --python`), re-runnable and reviewed
  like code. It writes:
  - `site/assets/joint.glb`: meshes, toon materials, outline shells (inverted hull), and two actions, `split` and
    `join`;
  - `site/assets/joint-poster.webp`: the joined pose as a still.
- **`site.Joint`:** a client component with `load: 'visible'` and props `{ split, model, poster }`, where `model` and
  `poster` are `ui.asset` URLs.
  - Its server render is the poster `<img>` with its dimensions: the view without JS, before load, and when WebGL is
    unavailable.
  - The client module uses three.js (`WebGLRenderer`, `GLTFLoader`, `AnimationMixer`):
    - a slow idle turn, and drag to rotate (no OrbitControls);
    - the `split` / `join` clip when the prop changes, then `data-pose="split" | "joined"` on the host;
    - under reduced motion, no idle turn and the pose without the clip;
    - everything disposed on `destroy`.
  - The home machine's `broken` drives `split`. The CSS `Joint3D` is removed.
- **Dependency:** `three` at an exact version in `site/package.json` only. No `@hozu/*` package changes.
- **Verification:** WebGL makes headless screenshots black, so the visual is checked by the owner in real Chrome.
  The site checks:
  - `hozu browse /` shows `site.Joint` mounted with one canvas;
  - after AI CHANGE, `data-pose` is `split`, and after APPLY FIX it is `joined`;
  - console errors 0;
  - with JS off, the poster image;
  - the bundle limit above;
  - the script re-run produces a `.glb` with both actions (a check reads its JSON chunk).
- **Out of scope:** shadows, post-processing, Draco compression.

## Peg and the films (amendment, 2026-10-03)
- **Peg** is the red peg (込み栓) that locks the joint: the checker. The first drawings came from the film project;
  the site's Peg is redrawn in `assets/peg/` with arms, brows and a sign on a pole, in the same body, palette and
  stroke: `peg` (calm), `peg-hello-animated` (waves and blinks), `peg-wait-animated` (stern, stomps, shakes the
  sign), `peg-fits-animated` (hops, sparkles), `peg-oops-animated` (wobbles, a sweat drop). Each SVG stops under
  `prefers-reduced-motion`. `site/peg.ts` places one by mood, sized by body height, so every Peg keeps one scale.
- **Where Peg appears, and why:**
  - **The hero demo:** waving before the first change, **WAIT.** while the change is wrong (HZ049), **FITS!** after
    APPLY FIX, in step with the joint. Each swap pops (`pop` motion); the card shakes, Bob's note slides in on a red
    flash (`intrude`), and the status line flashes green on the fix. All of it is the existing machine view, so it
    adds no JavaScript.
  - **The back of every catch card:** OOPS!
  - **404:** WAIT. ("Nothing fits here").
  - **The diagnostics doc:** a calm Peg with one line on what `hozu check` does.
  - **Start:** the waving Peg, decorative.
  - Not in the header or the favicon: the logo stays the brand mark.
- **The films:** `hozu-play` (3:33, for vibe coders and designers) in a Watch section under the hero, and
  `hozu-devtools` (1:33) in the DevTools hero. Both are 720p H.264 with faststart, `preload="none"` with a poster,
  never autoplay, so a page loads no video bytes until someone presses play. Verify fails when a film preloads or is
  over 8 MB.

## Accessibility
- One `h1` per page, and a skip link.
- Every interactive part works with the keyboard; the flip cards flip on focus.
- Contrast is at least 4.5:1 for text. Red on off-white is used only for large display type and blocks.
- `prefers-reduced-motion` stops every animation, and the ticker has a pause button.

## Verification
- **Kept from today:** export with 0 skipped routes; verify's checks of every HTML file (one `h1`, links and assets
  resolve, sitemap, canonical URLs, share image, 404).
- **New checks.** Each one is broken on purpose once and seen failing before it is trusted:
  - the header version equals `packages/core/package.json`;
  - the islands are exactly the three above (and the copy module on code pages);
  - every number in the bill and the ticker links to a trial page that exists;
  - each flip card's code exists in the diagnostic registry under the name it shows;
  - the playground's `hozu render` snapshot equals a fresh run;
  - a stylesheet rule under `prefers-reduced-motion` covers every animation the kit declares.
- **`hozu check` on the site:** 0 errors, the lock current.
- **The interactions** (the demo's split and snap, the flip cards, the playground, the ticker pause) are checked in a
  real browser with `hozu browse`, with JS on and off. Headless screenshots are used for layout only.

## Framework gaps
- This is the first real site built on 0.9 kits. Anything 0.9 cannot express, or expresses awkwardly, is recorded in
  `site/FRAMEWORK-GAPS.md` as approach → result → root cause.
- If a principle blocks the design (for example, no `style` attribute for the 3D joint's transforms), work stops and
  the owner decides. The site does not work around it quietly.

## Order of work
1. Kit and frame: `Header` with the version, `Footer`, `Section`, type, `Button`, `Tag`, and the reading layout,
   so the inner pages are on the new design first.
2. The home page, section by section; the hero demo and the 3D `Joint` last.
3. The playground and the pipeline lab.
4. The new verify checks, each seen red once.
5. A browser pass, then merge `site-0.9` into `main`. The push, which deploys, is the owner's call.
