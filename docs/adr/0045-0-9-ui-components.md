# ADR 0045 — 0.9: declared UI components (breaking)

- Status: accepted (2026-10-01). The owner took every gate as recommended (G1–G6). Phase 1 (the contract layer),
  phase 2 (record time) and phase 3 (styles) are done; see "Phase 2 notes" and "Phase 3 notes".
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

## Phase 0 results (2026-10-01, base `80d55fe`)
Recorded in `bench/ui/baseline-0.8/`; see its README.
- P7 is 7 893 B.
- The per-route `js` mode, island count and widgets are recorded for 11 projects.
- HZ079 pre-scan: 30 same-property pairs.
  - 6 are real: the showcase tabs, base against toggle, for `color` and `dark:` `color`, on 3 nodes.
  - 24 are exclusive toggle pairs (F's exception).
- The expected failures for G and HZ079 fail for the reason stated. A first draft of the G test failed on HZ059
  "callback was not lowered", a fixture mistake, and was rewritten. G also covers method calls: `.trim()` on a
  lowered template string is HZ059 today.

## Contract layer (phase 1)
Types only. Every 0.8 program builds to the same IR apart from `irVersion: 3`, `ProjectIR.kits: {}` and
`FeatureIR.components: {}`. Later phases build on these names and do not invent their own.

**IR v3** (`packages/core/src/ir/types.ts`, schema `packages/core/schema/project-ir.schema.json`):

| Type | Where | Change |
|---|---|---|
| `ProjectIR.irVersion` | `types.ts:6`, emitted at `core/src/build/project.ts:456` | `3` |
| `ProjectIR.kits` | `types.ts:16`, emitted at `core/src/build/project.ts:466` | `Record<string, KitIR>`, always `{}` |
| `KitIR` | `types.ts:19` | `{ components: Record<string, ComponentIR> }`. The kit's `styles` file belongs in the bindings, next to the feature styles; phase 3 adds it there, so `Bindings` is unchanged |
| `FeatureIR.components` | `types.ts:97`, emitted at `core/src/build/feature.ts:288` | `Record<string, ComponentIR>`, always `{}`; `FeatureIR.widgets` stays until phase 4 |
| `ComponentLoad` | `types.ts:128` | `'eager' \| 'visible' \| 'idle'` |
| `ComponentIR` | `types.ts:130` | H's fields: `tag`, `props` (schema ref; a component without `props` gets the ref of the empty schema, as `input: 'raw'` does), `variants` (key → values), `defaults` (key → value), `slots`, `children`, `events`, `emits` (name → schema ref), `extend`, `owned` (class list), `client` (`{ load, sourceHash } \| null`), `sourceHash` |
| `UseIR` | `types.ts:145` | `{ component, variant, added, overrides }`; `component` is the id (`ui.Button`, `notes.Composer`) |
| `ViewNode` | `types.ts:308` | gains `ComponentNode`. Nothing emits it: widgets emit `kind: 'widget'` until phase 4 |
| `ElementNode.use?` | `types.ts:323` | `UseIR` on the root of a pure use; never set yet |
| `ComponentNode` | `types.ts:338` | `{ id, kind: 'component', use: UseIR, class, toggle, vars, props, on, children }` (decision 1) |

- Every `ViewNode` switch in the repository already has a `default`, so adding `ComponentNode` needed no runtime
  change. The client bundle is byte-identical: budget P7 stays 7 893 B.

**Builders** (`packages/core/src/builders/component.ts`, exported from `@hozu/core`):

| Name | Where | Shape |
|---|---|---|
| `TvStyles` | `component.ts:10` | the part of a `tv()` result Hozu reads: callable, with `variants`, `defaultVariants`, `slots`. Declared structurally, so tailwind-variants is not a dependency yet; phase 3's real `tv()` result satisfies it |
| `VariantProps<S>` | `component.ts:17` | tailwind-variants' definition: the first parameter of `S` without `class` / `className` |
| `ComponentTypes` | `component.ts:27` | `{ variant, props, slots, on, children }`: what a call site is typed from |
| `ComponentDecl<T>` | `component.ts:35` | brand `'component'` (`DeclKind`, `core/src/model/decl.ts:24`) |
| `RenderScope` | `component.ts:37` | `{ props, slots, children, on, classes }` (C). `props` is the schema's output (defaults filled), `children` is `[]` unless `children: true`, `classes` holds the tv slots other than `base` |
| `ComponentUse<T>` | `component.ts:45` | B's keys: `variant`, `props`, `slots`, `on`, `class`. `props` is the schema's input, so defaulted fields are optional, and the key itself is optional when every field is |
| `ui.component` | `component.ts:89`, `:98`; `ui.ts:247` | two overloads: pure (no `client`, `load`, `emits`) and client (`client` and `load` required, `emits` optional) |
| `KitDecl`, `ui.kit` | `component.ts:142`, `:146`; `ui.ts:248` | `ui.kit({ id, components, styles? })`, brand `'kit'` (`decl.ts:25`) |
| `ui.use` | `ui.ts:116`, `:146` | a component overload (children only when it declares `children: true`) before the widget overload; at run time it records a `component` node for a component (`ui.ts:106`) |
| `project({ kits })` | `core/src/builders/feature.ts:82` | `KitDecl[]` |
| `InferInput` | `core/src/schema/standard.ts:14` | the Standard Schema input type, for `ComponentUse.props` |

- The transform treats `ui.component` and `ui.kit` as values, not view nodes, like `ui.widget`
  (`transform/src/transform.ts:25`).
- `packages/core/test/types.check.ts` has a Button with a tv-shaped `styles`, a component without props and a client
  component, and `@ts-expect-error` cases for: a variant literal outside its values, an unknown slot, a `Send` for an
  `emits` event, a missing required prop, children on a component without `children`, an undeclared DOM event, a
  client component without `load`, `emits` without `client`, and a render reading an undeclared slot. Each case was
  checked to fail for its stated reason, not another one.

**Reported as HZ014 until phase 2** (`core/src/build/components.ts:3`, message "… is not supported until ADR 0045
phase 2", with the location pointer and source; tested in `core/test/builders.test.ts`, broken once to red):
- a `ui.component` exported from a feature's declarations module (`core/src/build/project.ts:112`);
- `ui.use` of a component in a view (`core/src/build/view.ts:345`); the node becomes an empty `if`, as a failed
  branch does;
- every entry of `project({ kits })`, as "ui.kit is not supported …" (`core/src/build/project.ts:411`).

**Diagnostic codes:** HZ070–HZ080 are registered with the names and severities of the table below
(`core/src/ir/codes.ts:73-83`, `DiagnosticCode` at `core/src/ir/diagnostic.ts:70-80`). No test requires a registered
code to have a rule, a fix, a topic file or a catalog case, so they are registered now; each phase that emits a code
adds its rule, fix and catalog case. Their `see:` topics (`cli/src/output.ts:76-86`) point to `widgets` (HZ070–HZ078)
and `views` (HZ079, HZ080) until phase 5 adds `topics/components.md`.

**CLI output** (`packages/cli/src/contract.ts`, schemas regenerated under `packages/cli/schema/`):

| Type | Where | Change |
|---|---|---|
| `InspectFeatureOutput` | `contract.ts:40` | the former `InspectOutput`; `runInspect` returns it (`cli/src/commands/inspect.ts:5`) |
| `ComponentOwner` | `contract.ts:47` | `{ kind: 'kit' \| 'feature', id }` |
| `ComponentUseSite` | `contract.ts:52` | `{ feature, node, at, variant, added, overrides }`: one use, for `inspect`, `impact` and `check` |
| `InspectComponentOutput` | `contract.ts:61` | `{ component, owner, hash, ir: ComponentIR, uses }` |
| `InspectOutput` | `contract.ts:69` | `InspectFeatureOutput \| InspectComponentOutput` |
| `ComponentImpact` | `contract.ts:134` | `{ target, kind: 'component', owner, uses, features }` |
| `ImpactOutput` | `contract.ts:142` | `Impact \| ComponentImpact`; `runImpact` / `describeImpact` take `Impact` (`cli/src/commands/impact.ts:5,17`) |
| `CheckOverrides`, `CheckOutput.overrides?` | `contract.ts:202`, `:212` | `{ component, overrides, uses }` per component with overrides (E) |
| `MapRoute.components?` | `contract.ts:278` | the components a page uses (I) |
| `MapKit`, `MapOutput.kits?` | `contract.ts:320`, `:328` | `{ id, components }`: the `kits: ui 8, hozu 12` line |
| `DocsComponentProp`, `DocsComponent`, `DocsComponentsOutput` | `contract.ts:348`, `:355`, `:369` | `hozu docs components`: per component its id, owner, tag, variants with defaults, props with defaults, slots, children, events, emits, `extend` and client load; schema `docs-components.schema.json` |
| `RenderOutput` | `contract.ts:374` | `hozu render`: `{ ok, component, variant, html, class, owned, diagnostics }`, `owned` = CSS property names; schema `render.schema.json` |

- `overrides`, `kits` and `components` are optional until the phase that emits them, as ADR 0043 wave 1 did with
  `actors`, so no command's output changes now.

**Migration:** `normalize08` (`cli/src/commands/migrate-normalize.ts:228`) is the 0.8 IR in 0.9 terms. In phase 1 it
sets `irVersion: 3` and the two empty maps; phase 4 adds widgets → components. `hozu migrate 0.8` and
`migrate-equivalence.test.ts` compare the build with `normalize08(normalize07(0.7 IR))`
(`cli/src/commands/migrate.ts:273`, `migrate-equivalence.test.ts:123`); `normalize07` and its mapping counts are
unchanged.

**Proof:**
- `node --import ./packages/transform/dist/register.js bench/ui/baseline.ts --out <dir>` (the new `--out`; the
  default still writes `baseline-0.8/`), then `node bench/ui/compare.ts <dir>`: it checks `irVersion: 3` and the two
  empty maps, removes them, and compares with `baseline-0.8/`. **11 / 11 equal.** The per-route `js` mode, island
  count and widgets in `summary.json` and the 30 pairs of `conflicts.json` are equal too.
- **P7:** 7 893 B, unchanged.
- The four ADR 0045 `it.fails` (G and HZ079) still fail as expected.

**Decisions made in phase 1** (approved by the coordinator):
1. `ComponentNode` holds the component id only in `use.component`, the same place as `ElementNode.use` for a pure use,
   so the id has one spelling.
2. `normalize08` lives in `cli/src/commands/migrate-normalize.ts` and is composed after `normalize07`.
3. The two new schemas (`render`, `docs-components`), the `InspectOutput` and `ImpactOutput` unions, and the optional
   `overrides`, `kits` and `components` fields.

**Other choices the ADR did not fix:**
- `ComponentIR.props` is always a schema ref; without `props` it is the empty schema's.
- A client component requires `load`, as `ui.widget` did; `emits` is a type error without `client`.
- The `see:` topics of HZ070–HZ080 point to existing topics until phase 5.
- `bench/ui/compare.ts` is new: the equivalence check is a script, so the coordinator and later phases rerun it.

## Phase 2 notes (record time)
Pure components, kits, `UseIR`, G and the notes kit. Client components stay HZ014 until phase 4; the ownership checks
(HZ072–HZ079, the `!` rules) are phase 3, so this phase only records `added` and `overrides`.

**Moved by the coordinator:** the `@hozu/variants` runtime entry comes from phase 3 into phase 2, so the notes kit is
written with `tv` now. `@hozu/variants/config` and the `tv.ts` markers stay in phase 3.

**Amendment to the phase 1 contract (approved by the coordinator):** `KitIR` is `{ schemas, components }`
(`core/src/ir/types.ts:19`). A kit component's `props` and `emits` refs resolve in its kit's `schemas`, as a feature
component's resolve in `FeatureIR.schemas`, so a kit is self-contained.

**Implementation:**

| What | Where |
|---|---|
| G: an operation with no reference operand runs as JavaScript (`plain`) | `core/src/lower.ts:36`, the operators from `:69` |
| G: a method call passes its receiver and arguments to `lower.method` | `transform/src/transform.ts:587`, `core/src/lower.ts:98` |
| `ui.component` is a declaration the transform marks (`lower.done`), so an untransformed render is HZ044 | `transform/src/transform.ts:551`, `core/src/build/project.ts:338` |
| Feature components: `FeatureParts.components`, owner `feature.Name` | `core/src/build/project.ts:54`, `:196`; built at `core/src/build/feature.ts:289` |
| Kits: registered after the features, before any view is built; HZ013 for a kit id equal to a feature id or repeated | `core/src/build/project.ts:335`, `:499` |
| `ProjectIR.kits`, built in a scope rooted at `/kits/<id>` | `core/src/build/project.ts:431` |
| `ComponentIR` (`variants`, `defaults` and `owned` from the tv config, `client: null`) | `core/src/build/components.ts:217`, `owned` at `:191` |
| The use: owner checks (HZ007, HZ006), variants (HZ071, HZ031), props defaults, slots, `on`, the render, the root checks (HZ014), the root class and `UseIR` | `core/src/build/view.ts:312`; variants at `:258`, the tv root class at `core/src/build/components.ts:69` |
| HZ070 and the reference-props rule: the render is built once per declared component, and its output is walked for declaration references | `core/src/build/components.ts:150` (render), `:102` (walk), called from `:233` |
| A missing `on.x` leaves no handler; a missing slot is dropped from the children inside a render | `core/src/build/view.ts:57`, `:125` |
| `@hozu/variants`: `createTV`, `tv` from tailwind-variants 3.3.1 with tailwind-merge 3.7.0 | `packages/variants/src/index.ts` |
| Notes kit | `examples/notes/ui/` (`kit.ts`, `button.ts`, `input.ts`, `field.ts`, `tv.ts`) |

**Choices the ADR did not fix:**
1. **G, `branch`:** a literal condition returns the chosen branch when it is one child. An empty or several-item
   branch keeps today's `if` node, because a bare `null` or list is not a valid child (inline it is HZ014). `==` is
   evaluated as `===`, since the transform maps both to `eq`.
2. **A render must build under reference props** (follow-up, decided by the coordinator). Props are the state of a
   component and may be references (B); a value that must be a literal is a variant. So every declared component,
   feature-private or in a kit, used or not, is rendered once when it is registered, with references as `props`,
   `slots`, `children` and `on`, and the tv classes of its defaults.
   - **HZ070** is checked on that output: every event, query, mutation, route, view, fn, endpoint, widget, tag or
     message it reaches (sends, links, `ui.query`, `ui.embed`, fn and message calls, `ui.each` / `ui.query` branches
     called with a reference, nested `ui.use` options) is reported once, at the component's declaration pointer
     (`/features/<f>/components/<Name>` or `/kits/<kit>/components/<Name>`). Since the placeholders carry no
     declaration, what a caller passes is exempt by construction.
   - **There is no use-time HZ070.** The declaration-time render always runs, so no path needs it, and a use never
     reports a pair again.
   - **A render that throws there** is an error at the declaration pointer: HZ059 for a reference escape (for example
     `props.text.toUpperCase()`), HZ014 for anything else. The snippet fix: compute the value in the caller and pass
     it as a prop, make it a variant when it picks among fixed options, or use a fn() for a value. No render in the
     repository relied on literal-only props.
3. **`owned`** is sorted and de-duplicated. The root's `toggle` keys come from the same declaration-time render; a
   render that throws there is reported (choice 2) and contributes no toggle keys.
4. **`sourceHash`** is the fingerprint of the tag, the render's source and the tv config (base, slots, variants,
   defaults, compound variants).
5. **Props:** omitted fields are filled from the JSON Schema `default`; a field without a default stays absent, and an
   absent attribute is not rendered. A whole reference passed as `props` is used as is, without defaults.
6. **`AttrValue` includes `undefined`** (`core/src/builders/ui.ts:78`). The builder already skips an undefined
   attribute; without it, a render cannot pass an optional prop to an attribute under `exactOptionalPropertyTypes`.
7. **Variants:** `UseIR.variant` holds strings, defaults included. A boolean tv variant accepts `true` and `false`
   whichever keys it declares. An unknown key is HZ031 too. The HZ031 and HZ071 fixes are snippets, because a variant
   has no IR path to patch.
8. **Other use mistakes are HZ014:** an unknown `ui.use` key, slot or event, and children for a component without
   `children: true`. A failed use renders nothing (an empty `if`), as a failed branch does.
9. **Kit diagnostics** carry the kit id as `location.feature`; HZ044 for a kit component points at
   `/kits/<id>/components/<Name>`.
10. **The notes kit:** `ui/tv.ts` is `createTV({})` without markers until phase 3. Button has the tones `primary`,
    `subtle` and `plain` for the three button looks of 0.8; Input owns `rounded border px-3 py-2` and callers add
    `flex-1` / `w-full`; Field has the tv slots `base` (`space-y-3`), `label` and `error`.
11. **A component has one root.** Field needs a wrapper element, so it is used in Login only, where the label, the
    input and the error text are adjacent; the wrapper carries `space-y-3`, so the spacing is unchanged. NotesBoard's
    error text sits outside its form, so that group stays raw elements: a group that spans a layout boundary cannot be
    a component.
12. **`loop.test.ts`** sets a 30 s timeout for its own tests (`vi.setConfig`): two gate runs timed out at 5.0–5.4 s
    under load, and the file passes alone. The global `testTimeout` is unchanged.

**Proof:**
- **G:** the three probes in `transform/test/adr0045.test.ts` are `it` and pass. Each was broken once: `cond` without
  evaluation fails the `===` / `?:` case; `coalesce` fails the `??` and template cases; `method` fails the template
  case.
- **HZ070, HZ071:** catalog cases in `validator/test/source-mistakes.test.ts`, each broken once to red.
- **HZ070 at declaration (follow-up):** `core/test/components.test.ts` covers an unused feature component that sends
  an event, an unused kit component that reads a query, a component used twice and reported once per declaration,
  and the HZ059 / HZ014 throws. Broken once each: ignoring sends fails the event cases; ignoring queries fails the kit
  case; re-running the check at the use fails the reported-once case. After it: 539 tests, 532 passed, 1 expected
  fail (HZ079), 6 skipped; `bench/ui/compare.ts` 11 / 11 equal.
- **Inline form:** `core/test/components.test.ts` builds a `ui.use(Button, …)` and the hand-written `<button>` and
  compares them apart from `use`; it also covers defaults, absent slots and events, tv slots, kits and every
  diagnostic of this phase.
- **Equivalence:** `bench/ui/compare.ts` now lets only notes carry kits and components. For notes it removes `use`,
  compares each `class` as a token set and unwraps the Field use; it also compares every project's routes (`js`,
  islands, widgets). **11 / 11 equal.** Without the unwrap notes differs, and one changed class makes it differ.
- **The one difference in notes:** the Field wrapper `account.Login/2/0`. The login form's children were
  `label, input, p, button` (`/2/0`–`/2/3`); they are now `div[label, input, p], button` (`/2/0/0`–`/2/0/2`, `/2/1`).
  The rendered text, and the class sets of the label, input, error text and button, are unchanged.
- **P7:** 7 893 B. No page gains client JavaScript (the routes summary is equal).
- `hozu check` on notes: types ok, 0 errors, contracts 4/4, lock current.
- **Gate** (`pnpm gate`): lint clean (5 existing warnings), typecheck clean, 536 tests: 529 passed, 1 expected fail
  (HZ079), 6 skipped. P1 0.229 ms, P2 261.88 ms with exponent 1.112 (1.141 at the base), P3 223.171 ms, P5 20.6 M/s,
  P6 2.87 M/s, P7 7 893 B, P9 10 288 req/s, A4 55 663. The first gate run stopped at typecheck on a test fixture (the
  catalog's tv stub), which was fixed before the second run; bench ran once.

## Phase 3 notes (styles)
The CSS stage reads each class's properties, HZ072–HZ079 run on them, `@hozu/variants/config` and `hozu add kit`
generate `tv.ts`, and the repository is migrated for HZ079. Client components stay HZ014 until phase 4.

**Moved by the coordinator:** `hozu add kit <id> [--sync]` comes from phase 5 into phase 3, because HZ078's fix names
it. `hozu add component` stays in phase 5.

**Amendments to the phase 1 contract (decided by the coordinator):**
- `Bindings.components: Record<componentId, { inner: string[] }>` (`core/src/ir/bindings.ts:19`), not IR. It holds
  the class and toggle tokens of a render's non-root elements, tv slot classes and the `class` of nested uses
  included. It is recorded by the declaration-time render (`core/src/build/components.ts:149`, `:210`), which runs
  under placeholders, so a caller's slot and children content is excluded by construction. HZ073 and HZ075 read it.
  - A component whose declaration-time render throws (HZ059 / HZ014) records no entry
    (`core/test/components.test.ts`, the HZ059 / HZ014 case).
  - The only path that runs the CSS rules is `runValidate` (`hozu validate`, `hozu check`), and it passes the
    bindings (`cli/src/commands/validate.ts:56`). `testApp`, `hozu get` and `hozu browse` run no CSS rule.
    `cli/test/cli.test.ts:189` fails when the bindings lack `components` (broken once: passing
    `{ ...bindings, components: {} }` turns it red).
- `StyleFiles.kits: Record<kitId, file>` (`core/src/ir/bindings.ts:24`, filled at `core/src/build/project.ts:424`):
  a kit's `styles` is imported after the project entry and before the feature styles (`css/src/index.ts:51`).
- `CheckOutput.overrides` is required now (`cli/src/contract.ts:212`); `check.schema.json` and `migrate.schema.json`
  are regenerated.

**Implementation:**

| What | Where |
|---|---|
| `ClassStyle` `{ variant, important, properties, order }`, `ValidateOptions.classes` | `validator/src/context.ts:15`, `validator/src/index.ts:107` |
| The classes read: view candidates, every component's `owned` and `bindings.components` | `core/src/ir/classes.ts:47`, used at `css/src/index.ts:96` |
| One design system per project (`candidatesToCss`), stylesheets resolved as `compileStyles` does | `css/src/properties.ts:38`, `:236` |
| The baseline's per-class compile, used only when the design system cannot load | `css/src/properties.ts:227` |
| Where a declaration lands: the element, or a descendant part | `css/src/properties.ts:136` |
| Custom classes of the project's stylesheets | `css/src/properties.ts:190` |
| CLI cache (`node_modules/.cache/hozu/styles.json`) with unknown classes, properties and design tokens | `cli/src/styles.ts:49` |
| HZ079 | `validator/src/rules/styles.ts:132`; exclusive guards at `:91` |
| HZ074 | `validator/src/rules/styles.ts:244` |
| HZ072, HZ073, HZ075, HZ076, HZ077 | `validator/src/rules/styles.ts:308` (HZ072 `:369`, HZ073 `:316` / `:345`, HZ075 `:413`, HZ076 `:330`, HZ077 `:392`) |
| Inherited properties (HZ075), margins (HZ076) | `validator/src/rules/styles.ts:35`, `:34` |
| Overrides output: uses, grouping, the human line | `cli/src/uses.ts:5`, `:69`; `cli/src/commands/check.ts:97`; `cli/src/main.ts:245` |
| `designTokens` (the project's `@theme` keys and `@utility` names minus Tailwind's) | `css/src/tokens.ts:25` |
| `@hozu/variants/config`: scales, `twMergeConfigOf`, the block, staleness, `--sync` | `variants/src/config.ts:14`, `:41`, `:95`, `:124` |
| `hozu add kit [--sync]` (in a worker), HZ078 | `cli/src/commands/kits.ts:103`, `:180`, `:54`; called at `cli/src/commands/check.ts:93` |
| Showcase tabs (owner's option A) | `examples/showcase/features/site/views.ts:139` |
| Notes: generated `ui/tv.ts`, one override | `examples/notes/ui/tv.ts`, `examples/notes/features/account/views.ts:38` |
| Baseline scan against HZ079 (`agreement.json`) | `bench/ui/baseline.ts:233` |

**Choices the ADR did not fix:**
1. **Reading properties.** One Tailwind design system per project, loaded with the core loader and a resolver that
   maps `tailwindcss` to `@hozu/css`'s copy and other ids through Node's resolution; the per-class compile of
   `bench/ui/baseline.ts` is the fallback. On the 11 projects both give the same variant, `!` and properties for
   all 541 classes (custom classes come from the same compiled CSS in both).
2. **Property keys.** A declaration on the element is keyed by its property; one on a descendant by
   `<descendant part> <property>`, for example `space-y-3` sets `> :not(:last-child) margin-block-start`. So
   `space-y-3` is no margin of its own (HZ076) and still conflicts with `space-y-4`. Custom properties,
   `@property` and `@keyframes` are ignored; `!important` is stripped from values; inside one class the last
   declaration wins, as in the per-class output (the `@supports` colour-mix of `bg-x/70`).
3. **Custom classes:** a plain rule `.name` (or `.name <descendant>`) outside any condition, `@layer` allowed.
   `.name:hover`, `.name[data-x]` and rules under `@media` are states and are skipped. In the cascade, a layered
   custom class comes before every utility and an unlayered one after (`order`). `panel`, `site-header` and
   `reading-list` are read; none adds a finding.
4. **`!`:** both spellings are important for "the same `!`" and for overrides; HZ074 reports the leading one.
   `UseIR.overrides` keeps phase 2's trailing-only list. Two `!` classes with the same properties conflict too.
5. **HZ079 reports one diagnostic per pair** (the tabs: 6). The base-against-toggle patch moves every base class that
   conflicts with that toggle key into one complementary toggle, so the patches of one node are identical and
   applying both is idempotent. The complement of `x === v` is `x !== v`, of `!c` is `c`, otherwise `not`. Two
   static classes: the patch removes the one earlier in Tailwind's order (`getClassOrder`). Two toggles whose guards
   can hold together have no patch kind in F, so they get a snippet.
6. **Exclusive guards** are exactly F's list. A toggle value that is a plain reference `c` is `%truthy(c)`;
   `x !== v` / `x === v` match with the operands in either order. Nothing else (no `and` conjuncts) counts.
7. **HZ072** points at the use root's `class`. Owned properties are the keys of every `ComponentIR.owned` class.
   With `extend: false` it needs no CSS data. The fix is a two-line snippet: the variant, then the `!` form.
8. **HZ073** for a tv class points at `…/components/<Name>/owned/<i>` with a patch; for a render class at the
   component, snippet only (it has no IR path). It and HZ074 need no CSS data.
9. **HZ075** compares the caller's own inherited properties with the render classes that have no variant.
   **HZ076** reports any owned class with its own margin, in any variant; its patch removes `owned/<i>`.
   **HZ077** needs CSS data; its patch rewrites the use root's `class`.
10. **Overrides output:** one override is one `!` class; the places are feature ids with their counts, at most
    three, then `+N more`; `at` is the use's `file:line`.
11. **`hozu add kit <id>`** writes `<id>/kit.ts` and `<id>/tv.ts` (`ui/` for `ui`), imports the kit as `<id>Kit`,
    adds `kits: [<id>Kit]` before `features:` and `@hozu/variants` to the dependencies. It runs in a worker, like
    the scaffold's lock seed, so the app modules never enter the CLI process. `--sync` without the marked block is a
    usage error.
12. **The block:** markers `// hozu:variants-config <id>` and `// /hozu:variants-config`. Staleness compares the
    text with whitespace, quotes and trailing commas normalised, so a formatter does not make it stale. HZ078 is
    reported by `hozu check` only, for a kit in `ProjectIR.kits` whose `<id>/tv.ts` has a block, at `/kits/<id>`
    with the marker line as source. The tokens come from the styles cache.
13. **The config:** the project's tokens minus Tailwind's defaults. Sub-keys (`--text-hero--line-height`) are
    skipped. A static `@utility` is the group `[name]`; a functional one is `{ name: [non-empty value] }`; a plugin's
    utilities (typography's `prose`) count as the project's.
14. **Notes override:** `rounded-lg!` on the sign-in button is a deliberate visual change on `/login` (corner radius
    0.25rem → 0.5rem), the requested demonstration. `bench/trial/notes/accept.mjs` selects by role and name and asserts
    no class or radius.
15. `hozu --help` lists `add kit` and `--sync`. `tsconfig.check.json` now references `packages/css` and
    `packages/variants`, so their tests are type-checked.

**Found, not fixed (phase 1 types):** `ui.component({ styles: tv({ … }), render: ({ props }) => … })` with the
`tv()` call inline and a render that destructures its argument is TS2769 "No overload matches this call": the render
is typed before `S` is inferred from the inline generic call. Binding the result first (`const styles = tv(…)`, as
A's example and the notes kit do) types correctly. The phase 3 fixtures use that form.

**Proof:**
- **Catalog** (`validator/test/source-mistakes.test.ts`, stage `css`, 12 cases): HZ072 (two), HZ073 (two), HZ074,
  HZ075, HZ076, HZ077, HZ078, HZ079 (three). Each rule was broken once and its cases went red: HZ072 never reported
  (2 red), HZ073 tv / render (1 each), HZ074, HZ075 (variant test), HZ076 (margin test), HZ077, HZ078 (status check),
  HZ079 base classes skipped (2 red), toggles never compared for exclusivity (1 red), and `exclusive()` always false
  (the two fixed cases red).
- **HZ079 agreement** (`bench/ui/baseline.ts --out`): before the showcase fix, the scan's 6 real pairs are exactly
  the 6 HZ079 findings and none of the 24 exclusive pairs is reported; after it, 0 and 0, the 24 still unreported.
  The ADR 0045 `it.fails` for HZ079 is an `it` now.
- **Custom token** (`variants/test/config.test.ts:25`): with `--text-hero` in `@theme`, `tv` keeps
  `text-hero text-white` with the generated config; with `createTV({})` it returns `text-white`. `hozu check` on
  notes with `--text-hero` added: HZ078, then `hozu add kit ui --sync` writes `text: ['hero']`, then clean.
- **IR** (`compare.ts`): the 9 other projects equal; routes (`js`, islands, widgets) equal. Showcase differs only at
  `/features/site/views/Showcase/root/children/1/children/2/children/1/children/{0,1,2}/class` and the toggle key
  `bg-white text-slate-900 shadow dark:bg-slate-950 dark:text-white` of the same three nodes (removed). Notes equals
  phase 2's normalised IR without the override; with it, only `account.Login/2/1` differs (`class`, `use.added`,
  `use.overrides`).
- **Tabs look:** in Chromium, the tab buttons' colour, background and shadow are identical before and after, light
  and dark, selected and not, on the server render and after a click. Selected: `text-slate-900 bg-white shadow`
  (dark: `text-white bg-slate-950 shadow`); not selected: `text-slate-600` (dark: `text-slate-300`), no background.
- **P7:** 7 893 B; no page gains client JavaScript.
- **`hozu check` wall time** (median, cold = no styles cache): notes 0.56 → 0.64 s cold, 0.51 → 0.58 s warm;
  showcase 0.60 → 0.77 s cold, 0.45 → 0.50 s warm.
- **Repository:** `hozu check` on the 10 examples and the site: 0 errors, 0 warnings.

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
- **Exception:** toggles whose guards are provably exclusive never apply together. That covers:
  - `c` / `!c`;
  - `x === v` / `x !== v`;
  - `x === a` / `x === b` on the same reference with different literals, `true` / `false` included.
  - Phase 0 found 24 toggle pairs in the examples, all of the last two kinds. The first draft's "syntactic
    complements" would have reported 16 of them falsely.
- **Same property:** two utilities conflict only when they set the same set of properties, ignoring custom
  properties, with different values.
  - Tailwind orders utilities with different property sets by its own property order, for example `p-4` before
    `px-2`, and `text-sm` before `leading-6`, so those refine on purpose.
  - Utilities that compose through custom properties set identical values, for example `blur-sm brightness-50`, so
    they do not conflict.
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
