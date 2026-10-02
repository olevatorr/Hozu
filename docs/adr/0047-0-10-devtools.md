# ADR 0047 — 0.10: Hozu DevTools — point at the screen, get a prompt that points at the source

- Status: **accepted** (2026-10-02). The owner took D1–D3, D5 and D6 as recommended. D4 changed: the tool UI is
  English only, like everything Hozu ships. The look follows Hozu's own style (the site's paper / ink / red poster
  language), not the prototype's.
- Look (owner, 2026-10-02, after the first P2 build): the poster style was too strong. The tool follows the calm,
  widely accepted look of framework dev overlays such as Next.js's (rounded, thin borders, soft shadows, normal
  weights) in Hozu's colours: ink surfaces, paper text, red accents. Outlines sit on a `mix-blend-mode: difference`
  layer so they show on any background, with a thin red inner line where difference fails (mid grey).
- Basis:
  - the standalone prototype in `~/Developer/hozu-devtools-demo` (ADRs 0001–0004 there);
  - the source index Hozu already records in development builds.

## Problem
A vibe coder sees something wrong on the screen. Today they describe it in words, and the agent searches the code for
it.

- **The prototype proved the interaction.** Its own README states the gap: the file, line and node identity in its
  prompt are fixture data, with no compiler integration.
- **Hozu already knows where every node comes from.** With `buildProject(project, { sources: true })` (the default
  outside an export), `BuildResult.sources` maps each IR pointer to `{ file, line, column }`. The notes example has
  138 entries:
  - 70 for view nodes, including each `ui.query` branch (`ready`, `failed.Unauthorized`);
  - parts, at the part's definition;
  - kit components, at their declaration.
- **What is missing:**
  - a way to go from a DOM element back to that pointer;
  - a prompt that tells the agent which file, which Hozu form and which check to use.
- **Why it matters (trial 0021):** in 16 changes Hozu spent 270 tool calls against Nuxt's 193 and read the guide in
  42 turns. A large part of a change is locating it. A prompt that already names the file and the right form removes
  that search.

## Goals
These are measurable, and the trial registered in Phase 6 measures them.

| # | Goal | Measure |
|---|---|---|
| G1 | **Every selectable node resolves to a source location** in the project | 100 % of rendered elements in `examples/*` and `site/` carry a marker that resolves to a `file:line:column` that exists |
| G2 | **The prompt points the agent at the change** | Each item names: the file and line, a code excerpt, the node kind, the correct Hozu form for the change, the scope and the verify commands |
| G3 | **A non-coder can finish the loop without reading code** | Select, describe, copy or save, hand it to an agent, check the result, all in the browser |
| G4 | **Zero production cost** | A production build has no markers and no DevTools code; budget P7 is unchanged |
| G5 | **The tool never edits source** | Only the agent edits code, and Hozu's checks verify the edit (AI-first: the AI writes, Hozu checks) |

## Two modes
The two modes come from the prototype. **D1: confirm this reading.**

| Mode | From | Layout | For |
|---|---|---|---|
| **Overlay** (default) | demo v2 | The real app fills the window; a small draggable dock with **Browse / Select** | Quick feedback while using the app |
| **Workbench** | demo v1 | Node tree on the left, the app in an exact-size viewport (presets, rotate, resize grip), inspector on the right, plus a state lab | Careful review: every state, every breakpoint |

- Both modes share the inspector, the request list and the prompt export.
- The mode, the dock position and the drafts persist per project, in the browser's storage.

## More nodes: what a user can select
The prototype's tree had 14 annotated nodes. DevTools exposes every node kind the IR has, so a user can say exactly what
should change.

| Node kind | Selected by | Shows | Points the agent at | Prompt guidance |
|---|---|---|---|---|
| Element | click | tag, classes, owned properties | view file:line | change classes (no `style`; HZ026) |
| **Text** | double-click on text | the literal | the string inside the element | edit the copy only |
| Data text | click on bound text | `note.title` from `listNotes` | query + field, and the view line | "comes from data: change the data or its formatting" |
| **Component use** | click (badge `ui.Button`) | variant, props, slots | use site **and** declaration | the scope decides: here → `class` at the use (HZ072 rules); everywhere → the variant in `tv()` |
| Component internals | the tree under a use | the slot or element in `render` | kit file:line | everywhere it is used |
| Slot content | the tree | the caller's content | use site | |
| Part | the tree (badge `part`) | | definition **and** call site | shared by every call |
| Branch: `when` / `?:` / `ui.if` | tree, "states" | condition, machine states | view file:line | preview the branch (Phase 5) |
| Query state | tree | `pending` / `ready` / `failed.<Error>` | view file:line + query | |
| List item / empty | click an item | `ui.each` key, index | view file:line | "every item" vs "this one: needs data" |
| **Behaviour** | the "on click" chip | event → transition (`clean --Break--> broken`) | model.ts transition | a deciding change needs a contract (HZ016/HZ018) |
| Page | the dock | route, head (title, description) | page declaration | head fields only |

- **Hover** outlines a node and shows its kind and name.
- **Select** opens the inspector.
- **Alt+click** walks to the parent; **↑ / ↓** move through the tree.
- **Shift+click** adds nodes to one request ("these three").

## Source resolution
- **Markers.** Only under `hozu dev` (`HOZU_DEV=1`):
  - the generated server render (`generateRender`) adds `data-hz="<n>"` to every element;
  - the client runtime does the same on nodes it renders.
  - `n` is an index into the build's node table, so the HTML stays small.
  - Production renders never take the dev path. A test asserts that no `data-hz` and no DevTools module appear in
    `hozu build` output.
- **Resolver.** The dev server answers `GET /_hozu/dev/node/<n>` with the IR pointer, the node kind, the source
  location (and a second location for parts and component uses), the owning feature, view, component or kit, the
  conditions on the path, the bindings (query, field, event, transition) and a 7-line code excerpt.
  - The endpoint is bound to 127.0.0.1, dev only.
  - Its shape is a JSON Schema in `packages/cli/schema/` (like the CLI outputs).
- **CLI for agents.** `hozu locate <pointer> --json` returns the same record from the IR. An agent can re-resolve a
  request after edits have moved lines; the pointer is stabler than a line number.
- **Accuracy:**
  - text literals resolve to their element plus the exact string;
  - inlined parts give both locations;
  - list items give the `each` source plus the item key.

## The prompt
- **Format:** Markdown that humans can edit, with a fenced JSON block (`hozu-request`) for agents. One item per change.
- **Each item contains:**
  1. **What the user wants:** their words, plus a style diff turned into utility classes (see "Style edits").
  2. **Where:** `features/notes/views.ts:61:14`, the IR pointer, the node kind and its owner, and the 7-line excerpt.
  3. **How, in Hozu terms:** generated from the node kind. Examples:
     - "this is `ui.Button` from kit `ui`; to change every button, edit the variant in `ui/button.ts`";
     - "this text comes from `listNotes.title`";
     - "this button sends `Break`; changing what it does is a deciding change and needs a contract".
  4. **Scope:** this node / every use of the component / every item of the list.
  5. **Context:** the route, the viewport width and height, the machine state or query branch being previewed, and the
     signed-in actor.
  6. **Verify:**
     - `hozu check`;
     - `hozu render ui.Button --variant tone=ghost` for a component;
     - `hozu browse /path --do 'click Delete in "Buy milk"'`, with targets generated from the selection;
     - "list the accepted `now:` lines" when a lock change follows.
- **Rules the prompt states:**
  - no inline `style`;
  - classes must produce CSS;
  - a component's owned properties change through its variants;
  - a deciding transition needs a contract.

  These are the rules no diagnostic can check before the edit (the same set as `SKILL.md`).

## Delivery
- **Copy for AI** and **Download .md**, as in the prototype.
- **Save as request** (recommended, D2): the dev server writes `.hozu/requests/NNNN-<slug>.md`.
  - `hozu requests` lists them with their status (open / done).
  - A new skill topic `hozu docs requests` tells agents to:
    - read the request;
    - edit at the location;
    - run the verify commands;
    - mark the request done with the result.
  - The vibe coder can then say "do the open Hozu requests" to any agent.
- **The tool never writes application source (D3).**

## Style edits
- **Live preview:** the inspector edits size, spacing, radius, colours and typography. The change is applied to the
  selected DOM node only, inside the browser, and is never saved as `style`.
- **Translation:** the diff is turned into utilities from the project's own theme (`@theme` in the Tailwind entry),
  for example 24 px → `text-2xl`, `#fb3a0e` → `text-red`. When nothing matches, the prompt states the exact value.
- **Ownership:** when the property belongs to a component (HZ072–HZ077), the prompt says so. It asks for a variant,
  or a trailing `!` for a one-off, never a fight between classes (HZ079).
- The six properties of the prototype first, then layout (gap, width, alignment).

## State previews
- **Machine states:** the inspector lists the view's states. Choosing one starts the island in that state, through
  the dev snapshot restore that already exists (`runtime-client/src/dev.ts`). The context comes from the contracts'
  `given` when one exists.
- **Query branches:** a dev-only render override shows `pending`, `ready` or `failed.<Error>` for one query on one
  page. No resolver or mutation runs.
- **Lists:** empty, one item, many.
- Every preview is labelled "preview" in the dock, and the prompt records which preview the user saw.

## Scope of the change
- **New package `@hozu/devtools`:**
  - the overlay and workbench UI, in a shadow root so the app's CSS and the tool never touch;
  - zero third-party dependencies;
  - UI in English only (D4);
  - the site's paper / ink / red poster style, with thick rules and monospace metadata.
- **`@hozu/runtime-server`:** dev markers in `generateRender`, and the branch override.
- **`@hozu/runtime-client`:** dev markers on client renders, and state-preview hooks.
- **`@hozu/dev`:** injects DevTools and serves `/_hozu/dev/node/*` and `/_hozu/dev/requests`.
- **`@hozu/cli`:** `hozu dev` shows DevTools by default (`--no-devtools`), plus `hozu locate` and `hozu requests`,
  with schemas.
- **Skill:** a `requests` topic and one line in `SKILL.md`'s task index.
- **0.10 is additive:** no change to the authoring surface, the IR or the lock.

## Verification
- **Unit tests:**
  - the node table and resolver per node kind (12 kinds);
  - the prompt generator per kind (golden files);
  - utility translation against a theme.
- **Coverage test (G1):** every element rendered by `examples/*` and `site/` under dev has a marker, and every marker
  resolves to an existing file and line.
- **Production test (G4):** no `data-hz` and no DevTools code in `hozu build` output; P7 unchanged.
- **Browser tests:** real Chrome, both modes:
  - select every node kind, Alt+click to the parent, multi-select;
  - text and data-text;
  - component scope, behaviour chips;
  - state previews; copy, download and save;
  - JS-off pages, 360 px, reduced motion, keyboard only.
- **Breaks:** each guard is broken once and seen failing before it is trusted.
- **Security:** dev endpoints refuse non-loopback requests; a request file holds only what the user typed and the
  resolved metadata.

## Phases
Each phase ends with `pnpm gate` and a report.

| Phase | Delivers | Visible result |
|---|---|---|
| P1 | Node table, dev markers (server + client), resolver endpoint, `hozu locate`, coverage and production tests | `curl /_hozu/dev/node/12` returns the real file and line |
| P2 | Overlay mode: dock, Browse/Select, hover outline, inspector for every node kind, prompt, copy, download, save, `hozu requests` | A vibe coder can hand a precise request to an agent |
| P3 | Workbench mode: node tree, exact viewport, request list | Careful review |
| P4 | Style edits with theme-utility translation and ownership rules | "Make this bigger" becomes `text-2xl` at the right place |
| P5 | State previews: machine states, query branches, lists | Every state, without breaking the app |
| P6 | Docs, skill topic, site page, `create-hozu` notes; trial 0023 registered separately (ADR 0048) before any run | Release 0.10.0 |

## As built (P1, P2)
- **Markers are node ids, not indexes:** `data-hz="account.Login/2/1"`. The id is already in the IR, readable in a
  request and stable across reloads; the HTML cost is dev only.
- **Endpoints:** `GET /_hozu/dev/node?id=<id | page:<route>>` and `GET /_hozu/dev/page?path=<path>` on the app (dev
  only, loopback `Host` only); `GET|POST /_hozu/dev/requests` and `/_hozu/devtools/*` on `@hozu/dev`, which refuses a
  non-loopback `Host` and a cross-origin `POST`. Under `HOZU_DEV=1`, `hozu serve` binds 127.0.0.1 unless `HOST` is set.
- **`hozu dev`** starts `@hozu/dev` from the app (`--no-devtools`); the scaffold gets the script in P6.
- **What a change reaches:** a component use and a message carry the number of source places that use them (part
  call sites count once), so the prompt and the inspector can say "used in 6 places".
- **Pages** are nodes too (`kind: 'page'`, `hozu locate page:home`): declaration, route, views and the head fields.
- **Owner feedback, round 1:** requests are compact (Want, Where, Scope, Style, and a Mind line only where a plain
  edit goes wrong; no JSON block; the excerpt is a setting). Builder (default, plain words, the scope as a question)
  and Developer (files, excerpt, components, transitions, ids) are switched in the dock's settings or by
  `hozu dev --devtools developer`. Saved requests can be opened, edited before sending, marked done and deleted.
- **Order:** P4 came before P3 at the owner's request.

## As built (P4)
- **Look** in the inspector: font size, weight, text colour, background, padding at the sides and above/below, and
  corners. The preview is an inline style on the selected element in the browser only; Reset removes it.
- **Theme:** `@hozu/dev` answers `/_hozu/dev/theme` from Tailwind's `theme.css` with the project's `@theme` blocks over
  it (the app answers its entry at `/_hozu/dev/styles`). oklch colours are converted to sRGB for matching.
- **Translation:** each change becomes `- Style: font size 30px → 48px: replace \`text-3xl\` with \`text-5xl\``.
  A value off the scale gets the exact arbitrary class and the nearest step; a project colour wins over a Tailwind
  colour; spacing takes any multiple of 0.25 steps, as Tailwind v4 does.

## Rejected
- **Shipping source maps or markers in production:** cost and leakage. Dev only.
- **Letting the tool write source** ("apply this change"): it would bypass the agent and the checks, and it could not
  express a deciding change. Agents edit; Hozu checks.
- **A browser extension:** a second install, and per-browser work. Injection by `hozu dev` needs nothing.
- **A generic DOM inspector:** without the IR it cannot know a component from a part, or text from data. Those
  distinctions are the product.
- **Screenshots in the prompt by default:** large and not needed when the location is exact. Possible later as an
  option.

## Risks
- **Line numbers move as the agent edits:** the prompt carries the IR pointer, and `hozu locate` re-resolves it.
- **Inlined parts and component uses have two right answers:** both are shown, and the scope choice picks one.
- **Client-rendered list items share one source:** the item key goes into the prompt.
- **Overlay size and speed on large pages:** markers are numbers, and the tree loads on demand.
- **Vibe coders may not know what "scope" means:** plain-language labels ("only this one" / "every button like
  this"), plus a preview of how many places change.

## Decisions for the owner
| # | Decision | Recommendation |
|---|---|---|
| D1 | The two modes are Overlay (demo v2) and Workbench (demo v1), each with Browse/Select | yes |
| D2 | Save requests to `.hozu/requests/`, with `hozu requests` and a skill topic | yes |
| D3 | The tool never edits application source | yes |
| D4 | Tool UI in English only | decided: English only |
| D5 | Trial 0023: vibe-coder change requests with DevTools prompts against plain descriptions, pre-registered as ADR 0048 | yes, after P5 |
| D6 | Package name `@hozu/devtools`, shown by default in `hozu dev` | yes |
