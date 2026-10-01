# ADR 0045 — 0.9: declared UI components (breaking)

- Status: accepted (2026-10-01). The owner took every gate as recommended (G1–G6). Nothing is implemented yet.
- **Already decided by the owner, in the design dialogue that produced this ADR:**
  - components are declarations, not conventions;
  - `ui.widget` merges into `ui.component({ client })` in a breaking 0.9;
  - the call form is `ui.use(Component, …)`;
  - styles use tailwind-variants directly (T1), in a new package `@hozu/variants`;
  - the official component library is reserved as `@hozu/ui-kit`;
  - the caller's classes follow property ownership, with a trailing `!` as the only override.
- Builds on 0.8.0 (ADR 0043), which is not merged or published yet. 0.9 is released only after 0.8.0.
- **Terms:**
  - "principle N" is a principle of `CLAUDE.md`;
  - "root" is the element a component's render returns;
  - "owned" properties are the CSS properties a component sets on its root.

## Motivation
- The owner wants Button, Input, Card and similar UI reused across features, with their look managed in one place. The
  goals:
  - no copied UI trees and class strings;
  - the closed world, verification and feature boundaries stay intact.
- **AI-first reading:**
  - An agent must recognise a declared component at its call site without reading other files.
  - The tools must see components: `hozu map`, `inspect`, `impact` and a catalog.
- **Out of scope:** DevTools, a visual editor and a complete component library.

## Evidence
Probes were run on the 0.8 integration branch (`7b594dd`), in the session scratch directory. Phase 0 commits them as
expected-failure tests.

### 1. A `part()` cannot compute with literal arguments
The transform treats every part parameter as a reference (`transform/src/transform.ts:313`), because it cannot see the
call site. So an operator on a parameter always lowers to IR, even when the caller passes a literal.

| Inside a part, the caller passing literals | Result |
|---|---|
| `variants[o.variant]`, destructuring default, `` `rounded ${sizes[size]}` `` | static class |
| `variant === 'primary' ? 'a' : 'b'` as `class` | HZ014 "class must be a static string" |
| `o.variant ?? 'primary'` | HZ059, and the view is lost |
| `` `p-4 ${o.class ?? ''}` `` | HZ014 |

- The same code written inline evaluates as JavaScript. ADR 0043 H says a part has the same IR as the inline form, but
  that does not hold for literal arguments.

### 2. Class conflicts are decided by Tailwind's sort order
Measured with Tailwind 4.3.3 (`@import "tailwindcss"`, a fresh compiler per set):

| On one element | Winner, in either order |
|---|---|
| `bg-white` + `bg-indigo-600` | `bg-white` |
| `text-white` + `text-slate-900` | `text-white` |
| `px-4` + `px-2` | `px-4` |

- Same-property utilities are emitted sorted by name. Neither the order in `class` nor who wrote a class matters.
- So `class: 'bg-white', toggle: { 'bg-indigo-600': on }` never shows the toggle, and no diagnostic reports it.
- The showcase tabs (`examples/showcase/features/site/views.ts:139`) work only because their names happen to sort in
  the intended order.
- An override that touches only the base state also breaks the other states. For example, a caller's `bg-red-500` on a
  button whose class has `hover:bg-indigo-700` turns indigo on hover. tailwind-merge keeps both, because their variants
  differ.

### 3. Widgets are components with client code
- `ui.widget` already has typed props, typed events, a host tag and `ui.use`. It is used in three apps:
  - `examples/showcase`;
  - `examples/stations`;
  - `site/features/content`.
- Pure presentation has no declaration at all: a `part()` disappears at record time, so no tool can list it.

### 4. Tailwind's `!` modifier has two spellings
- `bg-red-500!` (v4) and `!bg-red-500` (v3) both compile to `!important` in 4.3.3.

## Options considered
1. **`part()` only, plus record-time evaluation:** no new concept.
   - Rejected by the owner: the tools cannot see a component, and an agent cannot tell a component call from a helper
     call.
2. **A new `ui.component` next to `ui.widget`:**
   - Rejected: it gives two declarations for "a typed, reusable element with props and events" (principle 1).
3. **One `ui.component`, with an optional `client`, and `ui.widget` removed (chosen):**
   - one declaration and one call form;
   - widgets keep working through the migration.

**Call form:**
- `ui::Button` is a syntax error in TypeScript, so it was not an option.
- `ui.use(Button, …)` is a fixed, greppable token, and widgets already use it. It was chosen.
- `ds.Button(…)` cannot be told apart from a plain function at the call site.
- A registry typed into `ui.$` is global injection (principle 2).

**Styles:**
- tailwind-variants was chosen over a Hozu-owned subset of `tv()` (T2): agents already know `tv()`.
- The risks of T1 are closed by D and F below.
- Arbitrary caller classes were rejected because of evidence 2. A category allowlist was rejected because it blocks
  legitimate needs (`opacity-0`, `relative`, `z-10`) and pushes agents to hand-write raw elements.

## Principles and decisions this ADR asks to change (stop-and-raise)
| Principle / decision | Change | Section |
|---|---|---|
| **Principle 4** | A component's render is closed: it reads only its props, slots, children and event handles. Behaviour that needs JavaScript lives only in the component's declared `client` module. | A, C |
| **CLAUDE.md, zero runtime dependencies** | `@hozu/variants` joins the exception list: tailwind-variants 3.3.x and tailwind-merge 3.x, run at record time only, so 0 B reach the client. | D |
| **CLAUDE.md, Tech** | The widget line becomes the component line; `@hozu/variants` is added to the packages; `@hozu/ui-kit` is reserved. | A, D |
| ADR 0009 (widgets), ADR 0043 H (parts) | See the next two tables. | A, K |
| ADR 0009 (styling) | `class` stays a static string. A trailing `!` is the only way to override a component's owned property, and only at a call site. | E |

**ADR 0009 (widgets): superseded in part.**

| Before (0.8) | After (0.9) |
|---|---|
| `ui.widget` | `ui.component({ client })` |
| `wraps` | derived from the render |
| `@hozu/core/widget` | `@hozu/core/component` |
| HZ029 | names components |

**ADR 0043 H (parts): narrowed.**
- A part still gives values, guards and view fragments inside one feature.
- A view subtree shared by several features is a component (K).

## A. One declaration: `ui.component`
```ts
// ui/button.ts
const styles = tv({
  base: 'inline-flex items-center gap-2 rounded font-medium disabled:opacity-50 aria-busy:cursor-wait',
  variants: {
    tone: { primary: 'bg-indigo-600 text-white hover:bg-indigo-700', ghost: 'text-slate-700 hover:bg-slate-100' },
    size: { sm: 'px-2 py-1 text-sm', md: 'px-4 py-2' },
  },
  defaultVariants: { tone: 'primary', size: 'md' },
})

export const Button = ui.component({
  tag: 'button',
  styles,
  props: z.object({
    type: z.enum(['button', 'submit']).default('button'),
    disabled: z.boolean().default(false),
    busy: z.boolean().default(false),
  }),
  slots: ['icon'],
  children: true,
  events: ['press'],
  render: ({ props, slots, children, on }) =>
    ui.button({ type: props.type, disabled: props.disabled, 'aria-busy': props.busy, on: { click: on.press } },
      [slots.icon, ...children]),
})
```
- **Fields:**
  - `tag`: the root's element. The render must return that element (HZ014 otherwise), and `hozu docs components`
    prints it.
  - `styles`: an optional `tv()` result.
    - Its root slot is the root's class; other tv slots are handed to the render as `classes.<slot>`.
    - Its variant keys are the component's variants. They are static only (B).
  - `props`: a schema. Values may be references, and defaults are filled from the schema, so the render never writes
    `??`.
  - `slots`: named content, each a `Child`. `children: boolean` says whether the component takes children.
  - `events`: names the render binds to DOM events. The caller passes a `Send` for each.
  - `emits`: client components only. Event schemas the client module emits; the caller passes `(detail) => Send`, as
    with widgets today.
  - `extend`: `false` refuses every caller class (E). It defaults to `true`.
  - `client`, `load`: see below.
- **Root class:**
  - Hozu applies the root class to the element the render returns. The render does not set `class` on it (HZ014).
  - The render may still set `toggle` and `vars` on the root, and those classes are owned too.
- **With `client` (0.9's widget):**
  - `client: new URL('./date.client.ts', import.meta.url)` and `load: 'eager' | 'visible' | 'idle'`.
  - The render's output is the server HTML the client takes over. `wraps` is gone: a render with content keeps it.
  - The client module is `export default implement<typeof DatePicker>(setup)` from `@hozu/core/component`, as today.
  - Hozu does not inspect the client's JavaScript (as with widgets); it reaches the app only through `props` and
    `emits`.
- **Owners:**
  - **A kit:** `ui.kit({ id: 'ui', components: [button, input], styles?: URL })`, listed in `project({ kits: [kit] })`.
    - `components` is a list of modules, like `feature({ declarations })` (ADR 0041), so names come from the exports.
    - The id is `ui.Button`. Any feature may use a kit component.
    - A third-party kit is an npm package that exports a kit. Its `styles` (a CSS file, usually its `@theme` tokens) is
      imported into the Tailwind entry like feature styles.
  - **A feature:** an exported component in the feature's `declarations` is private to it (`notes.Composer`). Using it
    from another feature is HZ006. Migrated widgets land here.
  - A kit id equal to a feature id is HZ013.

## B. The call form
```ts
ui.use(Button, {
  variant: { tone: 'ghost' },
  props: { disabled: ctx.busy },
  slots: { icon: ui.svg({ … }, […]) },
  on: { press: ui.send(Save, {}) },
  class: 'w-full',
}, ['Save'])
```
- `ui.use` is the only way to use a declared component. The keys separate what is fixed at build time from what changes:
  - `variant` (static, literal only);
  - `props` (may be references);
  - `slots`;
  - `on`;
  - `class` (E).
- **Static variants:** a variant value must be a literal. A reference there is **HZ071 variant-from-reference**.
  - The fix (snippet) moves the state to a prop and styles it through an attribute variant: `aria-pressed:bg-…`,
    `data-[tone=ghost]:…`.
  - Lowering a referenced variant into complementary toggles is deferred.
- **Typing:**
  - `variant` is typed from `VariantProps<typeof styles>`, `props` from the schema, `on` from `events` / `emits`, and
    `slots` from `slots`.
  - A literal outside the variant's values is a type error, and HZ031 at check.

## C. A closed render
- The render receives `{ props, slots, children, on, classes }`. Any feature declaration it references is
  **HZ070 component-closed-render**: events, queries, mutations, machines, routes, views, fns, messages, tags.
  - Its fix says what to pass instead: a `Send` through `on`, an `Href` prop instead of `ui.link`, text as a prop or a
    slot.
- **Allowed:**
  - `ui.*` element builders and `ui.asset`;
  - `ui.format.*` applied to props;
  - `?:` / `&&`, `ui.each` over a prop;
  - parts declared in the same module that reference no declaration.
- **What the caller provides:** state (`disabled`, `busy`, `selected`, `open`, `value`) is a prop. The component keeps
  no state of its own and has no hidden transition.
  - Ephemeral browser state stays native: `<details open>`, popover, `<dialog>` with `command` / `commandfor`. The app
    learns about it only through DOM events (`toggle` and its `newState` field).

## D. Styles: `@hozu/variants`
- **Two entries:**
  - **`@hozu/variants`** re-exports `createTV`. It is pure JavaScript and runs in the record-time module graph,
    edge included.
  - **`@hozu/variants/config`** is tooling. It generates the tailwind-merge configuration from the project's Tailwind
    design system, through `@hozu/css`, and it never enters the edge graph.
- **`ui/tv.ts` is generated by `hozu add kit`:**
  - It is `export const tv = createTV({ twMergeConfig })`, with the project's `@theme` namespaces and `@utility`
    names. For example, `--text-hero` becomes a font-size class, so tailwind-merge does not mistake `text-hero` for
    a colour and drop it.
  - The generated configuration sits between markers. When it differs from the current design system, it is
    **HZ078 variants-config-stale** (error), and its fix is `hozu add kit --sync`.
- **State through attributes:**
  - The guide's rule: style a state with the attribute that announces it (`disabled:`, `aria-pressed:`,
    `aria-busy:`, `aria-invalid:`, `aria-expanded:`, `open:`), so the accessibility and the look have one source.
  - `toggle` stays for states that have no attribute.
- **Tokens:**
  - Design tokens are the project's (or the kit's) `@theme`.
  - Per-instance values are `vars` set by the render from props.
  - No new token format.
- **No client cost:** tv runs only when the view is recorded. The IR holds the resolved class strings, so a page
  ships 0 B of tv.

## E. What a caller may add: property ownership
- **Owned properties:** every CSS property that any class of the root sets, in any variant or state, is owned by the
  component. Those classes are:
  - the tv root slot's `base`, every variant value and `compoundVariants`;
  - the render's root `toggle` keys.
  - `hover:` and `dark:` count, so an override cannot leave one state behind (evidence 2).
- **What `class` at the call site may do:**
  - add any class that sets no owned property, with any prefix (`opacity-0`, `invisible`, `relative`, `z-10`,
    `md:hidden`, `transition-opacity`, …);
  - set an owned property only with a trailing `!` (`bg-red-500!`), which wins in every state.
  - Without the `!`, it is **HZ072 owned-property-override** (error). The fix lists, in this order:
    1. declare a variant;
    2. if this use is a one-off, append `!`.
- **The `!` rules:**
  - Only a call site may use `!`. A `!` inside a component's own classes is **HZ073 important-in-component**: two
    importants would compare by sort order again.
  - The spelling is the trailing `!`. A leading `!bg-red-500` anywhere is **HZ074 leading-important** (patch).
  - A `!` on a property the component does not own is **HZ077 unneeded-important** (warning, patch removes it).
- **Visibility:**
  - Each use records its added classes and its overrides in the IR (H).
  - `hozu check` prints one line per component with overrides: `ui.Button: 3 overrides — home, notes ×2`, the first
    three places, `--json` lists all. This is output, not a diagnostic.
  - `hozu impact ui.Button` lists every use.
- **Warnings:**
  - **HZ075 shadowed-inherited-class:** a caller sets an inherited property (colour, font, line height, letter spacing,
    text alignment) on the root, and an element inside the component sets the same property, so the caller's class
    has no effect.
  - **HZ076 component-outer-margin:** the component owns a margin. Outer spacing belongs to the caller.
- **`extend: false`:** every caller class, `!` included, is HZ072.
- **Scope:** only the root. Elements inside a component cannot be styled from outside; a slot-level extension is
  deferred.

## F. One element, one value per property
- **HZ079 class-conflict (error), on every element of every view:** two classes of one element (`class` and `toggle`
  keys) set the same property under the same variant stack, and neither is `!`.
- **Exception:** toggles whose guards are syntactic complements (`c` / `!c`, `x === v` / `x !== v`) never apply
  together.
- **Fixes:**
  - for base against toggle: patch the base class into the complementary toggle (`{ 'bg-white': !c }`), or a snippet
    for the attribute variant;
  - for two static classes: patch removing the one that never wins.
- It also checks the merged classes of every component use. A tailwind-merge misclassification that survives in the
  merged string is caught here, not shipped.
- It runs in the CSS stage (`@hozu/css`, next to HZ026), because only the Tailwind compiler knows which properties a
  class sets. Custom classes from the project's stylesheets are covered the same way.
- This is breaking: the showcase tabs and similar 0.8 code are reported. `hozu migrate 0.9` applies the patches.

## G. Record-time evaluation of literals
- `@hozu/core/lower` evaluates an operation as JavaScript when none of its operands is a reference. That covers `===`,
  the comparisons, `&&`, `||`, `!`, `?:`, `??`, template strings, `+`, `-`, `.length` and method calls.
- References are recorded as today, so the IR of a part or a render called with literals equals the inline form with
  those literals (evidence 1).
- **Proof:**
  - the `migrate-equivalence` snapshots and every example build to the same IR before and after;
  - the evidence-1 probes flip from `it.fails` to `it`.

## H. IR v3, render plan and JavaScript
- **`irVersion: 3`:**
  - `FeatureIR.widgets` → `FeatureIR.components: Record<string, ComponentIR>`;
  - `ProjectIR.kits: Record<string, KitIR>`;
  - `ElementNode.use?: UseIR` on the root of a pure use;
  - `WidgetNode` → `ComponentNode` (`kind: 'component'`) for client uses.
- **`ComponentIR`:**
  - `tag`, `props` (schema ref), `variants` (key → values), `defaults`;
  - `slots`, `children`, `events`, `emits` (name → schema ref), `extend`;
  - `owned` (class list), `client` (`{ load, sourceHash } | null`), `sourceHash`.
- **`UseIR`:** `{ component: 'ui.Button', variant, added: string[], overrides: string[] }`.
- **Pure uses:**
  - inlined at record time, so the render plan and the rendered DOM equal the hand-written tree (class order aside);
  - 0 B of client JavaScript;
  - a test compares the IR with `use` removed against the inline form.
- **Client uses:** hydrate their own island exactly as widgets do today. Budget P7 is unchanged apart from renames,
  and a share above 0 B stops and is raised.
- The lock (`hozu.lock.json`) is unchanged: views are not locked.

## I. Tools
| Command | Output |
|---|---|
| `hozu docs components` | The app's catalog from the IR: per component its tag, variants with defaults, props with defaults, slots, events / emits, `extend`, and owner (kit or feature). It has a size test. |
| `hozu render <id> --variant k=v --props '<json>' --slot name=text` | The component rendered alone: HTML, final root class, owned properties and diagnostics. It exits 1 on errors. |
| `hozu map` | A header line `kits: ui 8, hozu 12`, and the components each page uses. The existing budgets stay. |
| `hozu inspect <id>` / `hozu impact <id>` | The declaration, and every use with its added classes and overrides. |
| `hozu check` | The `overrides` lines (E). |
| `hozu add kit <id> [--sync]` | `ui/` with the kit module, `tv.ts` and the `project({ kits })` entry; `--sync` regenerates `tv.ts`. |
| `hozu add component <kit\|feature> <Name> [--client]` | A component skeleton. `--client` replaces `hozu add widget`, with the bundle and the dependency. |

- **The guide:**
  - `topics/components.md` replaces `widgets.md`.
  - SKILL.md gains one "What to touch" row (UI → `ui.use` of a kit component, catalog `hozu docs components`), and
    stays ≤ 4 096 B.
  - Rules the diagnostics teach (HZ070–HZ079) stay out of SKILL.md (ADR 0043 K).

## J. Behaviour and motion
- **Motion:**
  - CSS transitions;
  - the existing motion names (`when`, `ui.each`, `ui.if`) passed to or used by a render;
  - cross-document View Transitions.
  - A JavaScript animation is a client component.
- **Focus and keyboard:** native first, with typed attributes that exist today:
  - `<dialog>` with `command` / `commandfor` and `closedby`;
  - `popover`, `popovertarget`;
  - `<details name>`;
  - `inert`.
- **Beyond native:**
  - roving tabindex, combobox typeahead, focus return after removal (`site/INTERACTIVE-REVIEW.md:14`);
  - a client component today;
  - a framework-owned behaviour layer is deferred to its own ADR, and is not disguised as presentation or motion.

## K. Parts and components
- A part stays the form for:
  - values and guards;
  - view fragments inside one feature, including fragments that reference the feature's declarations.
- A part whose view subtree is inlined by two or more features is **HZ080 shared-part-view** (warning; gate G2). Its
  snippet is the equivalent `ui.component`.

## L. Migration: `hozu migrate 0.9`
- **Rewrites:**
  - `ui.widget({ tag, props, events, client, load, wraps })` → `ui.component({ tag, props, emits, client, load,
    render })`, in the same feature. The render is the empty root, or `children` passed through for `wraps: true`.
  - `@hozu/core/widget` → `@hozu/core/component`.
  - `ui.use(W, { props, on, class }, children)` keeps its shape.
  - The HZ079 and HZ074 patches.
  - The `CLAUDE.md` / `AGENTS.md` Hozu block (`migrateGuide`).
- **What it prints:** shared parts (HZ080 candidates) and HZ072 sites, because the fix is an intent decision.
- **IR equivalence:** `normalize08` maps `widgets` → `components` and `widget` nodes → `component` nodes. Every
  snapshot must equal after the migration.
- **Never:** it never writes the lock and never deletes a contract.

## Rejected or deferred
- **`extend: 'any'`:** rejected (evidence 2, and design drift). `!` is the explicit, counted exception.
- **A category allowlist for caller classes:** rejected (see Options).
- **A Hozu-owned subset of `tv()`:** rejected (T1 chosen). It is the fallback if tailwind-merge cannot support the
  bound Tailwind version.
- **Deferred:**
  - referenced variants lowered to complementary toggles;
  - slot-level `extend`;
  - kit-owned messages (i18n inside a kit; text comes in as props or slots for now);
  - the behaviour layer (J);
  - the contents of `@hozu/ui-kit`;
  - DevTools and a visual editor.

## Diagnostic codes (allocated here, in one block)
HZ065–HZ069 stay reserved for 0.8, and HZ081–HZ084 are reserved for 0.9 findings. Nobody allocates "max + 1" during
implementation, and each code has one severity.

| Code | Name | Severity | Fix (summary) | Section |
|---|---|---|---|---|
| HZ070 | component-closed-render | error | snippet: pass a `Send`, an `Href` prop or text instead | C |
| HZ071 | variant-from-reference | error | snippet: a prop styled by an attribute variant | B |
| HZ072 | owned-property-override | error | snippet: declare a variant; or patch: append `!` | E |
| HZ073 | important-in-component | error | patch: remove the `!`, snippet: a variant | E |
| HZ074 | leading-important | error | patch: trailing `!` | E |
| HZ075 | shadowed-inherited-class | warning | snippet: a variant, or style the inner element | E |
| HZ076 | component-outer-margin | warning | patch: remove the margin; snippet for the caller | E |
| HZ077 | unneeded-important | warning | patch: remove the `!` | E |
| HZ078 | variants-config-stale | error | snippet: `hozu add kit --sync` | D |
| HZ079 | class-conflict | error | patch: complementary toggle or remove the loser | F |
| HZ080 | shared-part-view | warning | snippet: the equivalent `ui.component` | K |

- **Existing codes that change:**
  - HZ006 (private components);
  - HZ007 (a component in no kit or feature);
  - HZ013 (kit ids);
  - HZ014 (root tag, root `class`);
  - HZ029 (names components);
  - HZ031 (variant literals).
- **Each new code needs** a registry entry, a rule, a fix, and a mistake-catalog case broken once to red.
  - HZ070, HZ071 and HZ080 go in the IR catalog or the source catalog.
  - HZ072–HZ079 go in a new CSS stage of `source-mistakes.test.ts`.

## Phases
Each phase ends with `pnpm gate` once, a report, and a runnable example.

**Single-writer rule:** one worker at a time touches `packages/core/src/ir/*`, `builders/ui.ts`, `build/scope.ts`,
`build/view.ts`, `cli/src/contract.ts` and `packages/*/schema/*`.

0. **Baseline (coordinator):**
   - commit the probes as `it.fails`;
   - record each example's and the site's IR (v2), its per-page client JS and P7 at the base commit.
1. **Contract layer (types only):**
   - IR v3;
   - the signatures of `ui.component`, `ui.kit`, `ui.use` and `project({ kits })`;
   - `codes.ts` HZ070–HZ080;
   - the CLI output types;
   - the schemas.
2. **Record time:**
   - pure components, kits and `UseIR`;
   - HZ070, HZ071 and the changed HZ006 / HZ007 / HZ013 / HZ014 / HZ031;
   - G.
   - Example: `examples/notes` uses a `ui/` kit (Button, Input, Field) with plain classes.
3. **Styles:**
   - `@hozu/variants` and `tv.ts` generation;
   - HZ072–HZ079 in `@hozu/css`;
   - the repository migrated for HZ079.
   - Example: the notes kit on tv, with one `!` override.
4. **Widgets merge:**
   - client components and the runtime renames;
   - `hozu migrate 0.9`;
   - showcase, stations and the site migrated;
   - `hozu add component --client`.
5. **Tools and guide:**
   - I;
   - `topics/components.md` and the SKILL.md row;
   - `CLAUDE.md` / `AGENTS.md`, CHANGELOG 0.9.0;
   - the version bump and the `pnpm -r pack` rehearsal.

## Acceptance (pre-registered before phase 1)
1. A pure use adds 0 B of client JavaScript on every page of every example. The IR with `use` removed equals the
   inline form, and the rendered DOM equals it apart from class order.
2. Budget P7 is unchanged, or a share is raised before it moves.
3. Every snapshot is equal under `normalize08` after `hozu migrate 0.9`.
4. Every new code is broken once to red, and every new diagnostic carries a patch or a snippet (ADR 0043's AI-first
   conditions).
5. `hozu docs components` for the notes kit and a passing `hozu render` stay within their size tests.
6. **An agent trial is not part of this ADR.** A follow-up ADR registers it before any run, after trial 0021. The
   proposed metrics:
   - `!` overrides per change;
   - raw `ui.button` / `ui.input` written while a kit component exists;
   - lines per change.

## Decisions for the owner (all decided 2026-10-01: as recommended)
| Gate | Question | Recommendation |
|---|---|---|
| G1 | HZ079 on every element of every view (breaking; the migrate patches it), or only on component uses | **every element**: evidence 2 is a silent failure in 0.8 code too |
| G2 | HZ080 shared part subtree: warning or error | **warning** in 0.9; reconsider with the trial data |
| G3 | Events split into `events` (DOM, `Send`) and `emits` (client, `(detail) => Send`) | **yes**: the two have different payload owners |
| G4 | Kits may ship a stylesheet (`styles: URL`, usually `@theme` tokens) | **yes**: a third-party kit cannot work without its tokens |
| G5 | Text inside a kit only through props / slots in 0.9 (kit messages deferred) | **yes** |
| G6 | Phases run back to back with a report after each, like 0.8, or stop after each | **stop after phases 1 and 3** (the IR and the CSS rules), then back to back |
