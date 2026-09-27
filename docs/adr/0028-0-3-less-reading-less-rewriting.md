# ADR 0028 — 0.3: less reading, less rewriting (map, a composable scaffold, recipes)

- Status: accepted (the user approved all four items)
- Motivation: trial 0009 measured 0.2 at 2.05× Nuxt to build and 2.34× to change, with Claude Code in the app and
  equal correctness. The transcripts show three sources of cost that tools can reduce:
  - **Reading the whole app before a change:** `changing.md` plus every file, 18.8 k characters.
  - **Rewriting the scaffold:** `hozu add feature` gave a list and a form, and the spec also needs a detail page,
    toggles, a filter and an empty state.
  - **Searching for a pattern:** how a `<select>` works inside a form took 14.2 k characters of `grep` through the
    skill and the example.

  The rest is prior knowledge: the model writes Nuxt from memory.

## Decision 1 — `hozu map`
A compact outline of the app, meant to replace reading every file before a change.
- **What it prints:** routes (path, page views, head query) and each feature, with:
  - queries (scope, freshness, errors, tags) and mutations (errors, invalidates);
  - events and their payload fields;
  - the machine: context fields, and for each state its transitions (`Event → target`), `invoke`, `ignore` and
    `after`;
  - views (machine, route), `fn`s, and contract coverage.
- **Where things are:** every entry carries `file:line`, from the build's source index.
- **`--json`:** follows `map.schema.json`.
- **Size:** the example apps' maps must stay under 2 k characters (a test measures bookmarks and the trial app).

## Decision 2 — `hozu add feature <name> --with detail,toggle,filter,remove`
The scaffold composes the patterns common apps need. Each part is code from the verified example, with its
contracts and resolvers:

| Part | Adds |
|---|---|
| `detail` | a `/…/:id` route, a detail view with a 404 branch, a page whose head query sets the title and the 404 status, a link from each item. Needs `--page` |
| `toggle` | a `done` field, a toggle mutation, a `toggling` busy state, a badge and a per-item form button (`Mark done` / `Mark open`) that works without JS |
| `filter` | `All` / `Open` / `Done` buttons with `aria-pressed`, a context field, and `fn`s for the visible items and the empty state. Filtering happens in the page. Implies `toggle` |
| `remove` | a remove mutation, a `removing` busy state and a per-item `Delete` form button |

- Every busy state ignores every event its controls send (HZ005).
- Every transition has a contract (HZ016).
- **Each combination, from none to all four, must check clean.** A test creates a fresh app per combination and
  runs `hozu check` and a `hozu post` flow.
- **Not tuned to the benchmark:** the texts are generic ("No items", "Not found", "Delete"). The task board's
  wording stays the agent's job. The filter is in-page because that is how the example's toggle buttons work, and
  URL filters stay documented in `patterns.md`.

## Decision 3 — recipes in `changing.md`
Short copyable code for the changes agents make most often. Each recipe says which files and lines it touches:
- **An enum field chosen in the add form:** schema, event payload, mutation input, `<select name>` read with
  `ui.dom.form` (HZ033), a badge.
- **A bulk action button:** "Clear done", with its mutation, busy state, form button and contracts.
- **A detail page:** for an app scaffolded without `detail`.
- **A field shown on the detail page.**

`changing.md` starts with `hozu map`, then the recipe, then `hozu check`, then `hozu get` / `post`.

## Decision 4 — measure twice
Trial 0010 repeats trial 0009's setup: Claude Code in the app directory, Nuxt re-run the same way, the same task,
change and acceptance.
- **Each arm runs twice** per step, and the report gives both runs and the mean.

**Targets stated before the run (means):**
- build ≤ 1.5× Nuxt;
- change ≤ 1.5×;
- correctness in every run.

The targets are wider than 0.2's, because the part of the cost that is prior knowledge cannot be removed by tools.

## Not in 0.3
**Moving the authoring surface toward shapes models already know** (JSX-like views, conditionals in views). It
touches principles 1 and 4 and the product's main claim, so it needs its own ADR.

## Verification
- The gate is green, and parity stays 24/24.
- **New tests:**
  - `map` on bookmarks and on the trial app (content and size), and its schema;
  - every `--with` combination on a fresh app (`check` clean, and a `post` flow per part: toggle, remove, filter
    text, detail 404);
  - each recipe applied to the scaffolded app, then `check`.

## Implementation notes
- **`map`:** it resolves `file:line` from the build's source index. Bookmarks maps in 1,210 characters, and a test
  keeps bookmarks and the trial app under 2 k.
- **The scaffold's templates** live in `packages/cli/src/commands/scaffold.ts`, and `add.ts` wires them in.
  - `filter` implies `toggle`, and `detail` needs `--page`.
  - The detail page also gets `entries` (HZ025 otherwise warns).
- **Recipes:** `packages/cli/test/recipes.test.ts` applies the enum-field, action-button and detail-field recipes, as
  written, to an app scaffolded with `--with detail,toggle`. It then requires `check` to be clean and a `post` flow
  to show the new field and clear the item.
- **The Chromium feed test:** it flaked again under full-suite load. The sentinel can load page 3 right after page 2,
  so for a moment there is no "Load more" button. The test now asserts at most one button, which is the invariant
  it meant.
- **Gate:** green, 263 tests. The first run failed on that race.
