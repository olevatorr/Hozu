# ADR 0089 — Hozu UI ships with 1.0, placed and customised through DevTools

- **Status:** accepted with the owner's changes (2026-10-13): "在安裝的時候詢問要不要hozu ui，因為hozu ui會自己一個repo
  然後會有自己的官網"; "一次做完直接 rc". First request (2026-10-13: "我希望他跟hozu ui一起上 … hozu ui可以使用devtool直接放上去，然後一樣寫註釋，最後
  貼給ai來做 … 一個hozu ui專門展示的component tab可以直接看，然後ai可以來客制他們").
- **Changes** the 2026-10-10 decision that the kit is a separate product outside the 1.0 gate: it stays a separate
  product, with its own repository (`hozu-ui`), package, versions and site, but it launches with 1.0. The framework
  learns to install it and DevTools learns to show, place and customise it.
- **1.0:** 1.0.0-rc.1 waits for this. ADR 0088's candidate checks gain the trial in §5.

## 1. What the person does
1. **Look.** `hozu dev` → DevTools → a **Hozu UI** tab: every official component with each variant, live, in the
   app's own theme, together with the app's installed kit components.
2. **Place.** Select a part of the page. In the tab, choose a component and a variant, then *Place before / after /
   inside*, and write a note ("a primary button that saves the draft"). The request gets a numbered *Add* item at
   that place.
3. **Customise.** Choose a component in the tab, then *Change for every use*, and write a note ("rounder, the brand
   red"). The request gets a *Main component* item for the installed copy.
4. **Hand over.** *Copy for AI* / *Save request*, as today. The agent installs what is missing, places it and edits
   the copied source, then runs `hozu check` and `hozu requests done`.

DevTools still writes no source. Every change goes through the request and the agent (ADR 0047).

## 2. Options
| | A. Copy into the app (chosen) | B. An npm package imported at run time | C. Pre-rendered pictures only |
|---|---|---|---|
| The agent customises | the app's own files, in Hozu's form | through `class` / `!` overrides only | — |
| Updates | `hozu add kit ui --sync` with a three-way list for edited files | a version bump | — |
| Fits ADR 0045 (kits are app source, `tv()` at record time) | yes | needs kit imports from packages | — |
| DevTools previews | live, rendered by `hozu dev` from the package source | live | static, and they drift |

**A** follows the kit proposal (§3.4) and the owner's "AI can customise them".

## 3. Pieces
| # | Piece | Where |
|---|---|---|
| P1 | `@hozu/ui-kit`: the official source (23 components, themes Grain and Joinery, the Lucide subset and Hozu icons, the `hozu docs ui` topic) and `catalog.json` (each component's file, the files it uses, its variants). It is read at install time and by `hozu dev`, and nothing imports it at run time. It is published from the `hozu-ui` repository with its own versions; it requires a `@hozu/core` 1.x | `hozu-ui` repository |
| P0 | `create-hozu` asks "Add Hozu UI, the official components? (y/N)" in a terminal; `--ui` / `--no-ui` answer it for agents and scripts. Yes → the kit is copied in (from `npm pack @hozu/ui-kit`) with its lock, `@hozu/variants` and `@hozu/ui-kit` are added; SKILL.md's table and `hozu docs` (which lists `ui` when the kit is installed) point the agent at it | `packages/create-hozu` |
| P2 | `hozu add kit ui --from official` (no `--theme` flag: the theme is `data-theme` on any ancestor) and `hozu add component ui <Name> --from official`. They copy the files, with the components each one uses, and write `ui/kit.lock.json` (file hashes). They sync `tv.ts` and add `@hozu/variants` | `cli/commands/kits.ts`, `add-component.ts` |
| P3 | `hozu add kit ui --sync`: a file still equal to its lock hash is updated; an edited file is left alone and listed under `todo` | `kits.ts` |
| P4 | (superseded by §7: installed components are previewed, the others listed) `hozu dev` serves the official catalog: it builds the package source as a kit beside the app, and renders each component × variant with `componentCatalog` / `dev.render` (the Assets board's path), in the app's theme | `@hozu/dev`, `runtime-server` dev endpoints |
| P5 | DevTools **Hozu UI** tab: a grid of components and variants with search; for each, *Place* and *Change for every use*. An installed component shows *Where used* | `packages/devtools` |
| P6 | Request items:<br>`Add: ui.Button { tone: 'primary' } after <button "Save"> at features/notes/views.ts:42 — not installed: npx hozu add component ui Button --from official`<br>`Main component: ui.Button (ui/button.ts) — every use`<br>Each carries the person's note. `hozu docs requests` explains them | `devtools/src/prompt.ts` |
| P7 | Guide: `hozu docs ui` (intent table: "a destructive confirmation → `ConfirmDialog`"); SKILL.md's "What to touch" gains *Add* / *Main component* request items | skill topics |

## 4. Order (one release: 1.0.0-rc.1)
1. P1 in `hozu-ui`, then P2, P3, P0 and P7 in the framework, then P4–P6.
2. Trial 0029 (§5), run on local tarballs of both repositories before anything is published.
3. 1.0.0-rc.1 of the framework and the first `@hozu/ui-kit` together. The owner sets up npm Trusted Publishing for
   `@hozu/ui-kit` in the `hozu-ui` repository, or publishes it by hand.

## 5. Trial 0029 (pre-registered with 0.33)
- **Who:** a designer agent, from `create-hozu`, uses only DevTools, driven by a script as in trial 0023. It places
  three components and customises one main component, with notes. A builder agent receives only the saved request.
- **Pass:** each placed component appears where it was put, with the variant chosen; the customisation applies to
  every use; `hozu check` is clean; the agent edited no file outside the request's scope.

## 6. Risks
- **The kit's `theme.css` resets Tailwind's palette** (spike 1: 1 544 HZ026 in an existing app). The install keeps the
  partial mode of proposal §3.4: without the reset until the app's own classes are clean.
- **Two more releases before 1.0.** Each adds API (CLI flags, request item kinds) that 1.0 then freezes. That is the
  reason to land them before 1.0 rather than after.

## 7. As built (before the candidate)
- `hozu add kit ui --from official` copies the whole kit; an app whose classes still use Tailwind's palette, radii or
  shadows gets the theme without its resets (`partial` in the lock) and a todo line until they move to the kit's roles.
  `create-hozu --ui` writes the strict theme, a home page that uses the kit, and the package's pre-generated `tv.ts`.
- `--sync` replaces a file only when the package changed it and the app did not; a file both changed is listed.
- DevTools previews installed components live. A package component the app does not have is listed with its install
  command and can be placed, but is not previewed: rendering the package beside the app is left for after 1.0.
- `@hozu/ui-kit` is published from the public `hozu-ui` repository on a version tag, after the owner approves the npm
  environment; its site is ui.hozu.org (GitHub Pages, built with Hozu).
- From the review before the candidate:
  - `--sync` copies files a newer component starts to use, and names files the package dropped;
  - `withModule` edits a formatted `kit.ts` (multi-line imports, a trailing comma);
  - the partial-theme check also covers bare `rounded` / `shadow`, `font-serif` and `ring-offset-*`;
  - a kept file is listed;
  - `create-hozu --ui` runs `npm` through the shell on Windows and checks the folder before downloading.
- From building ui.hozu.org:
  - under `hozu dev` the stylesheet includes every component's classes, so DevTools previews unused ones styled;
  - `ui.link(…)` turned into text (`${ui.link(home)}#x`) stops the build with HZ059 instead of rendering
    `[object Object]`. A link to a section of another page is left for after 1.0.

- From the owner's second look at drag-and-drop:
  - Assets opens docked beside the page; Full screen stays a button, and a choice the person made is remembered;
  - a drag owns the page's mouse events until the click that ends it, so a drop never presses the button or link
    under it;
  - `p.example(component, name, () => node)` is a named, composed example rendered as written; `project({ previews })`
    takes a list, so the kit's `ui/previews.ts` (copied and registered by the install) sits beside the app's own. A
    parent card shows its examples first and its parts (catalog `parts`: Table → Tr, Th, Td) as chips; dragging an
    example asks the agent to build it like that example;
  - the catalog's `pickers` give `Icon` a searchable grid of the app's icon exports (`/_hozu/dev/icons`); a Lucide
    name the app lacks is added to `ui/icons/lucide.ts` first by the agent;
  - hovering or focusing a Layers row frames its part on the page (scrolled into view only when off screen).

- From the owner's third look:
  - a click where nothing is marked clears the selection;
  - only a component the person placed (pending) can be dragged again; a click on it without moving edits its item,
    and its request item follows the move without a new note;
  - while dragging, the component itself is shown where it would land;
  - previews: the inner parts' classes of every variant are compiled under `hozu dev` (`partClasses`: Card's padding,
    PageHeader's display size were missing), a part sized by container queries gets a width (Metric), an icon tile
    shows the picker's first icon until one is chosen, and a dialog tile shows the dialog open.
