# ADR 0029 — 0.3, continued: inspect pages without a server, a scaffold that says what to edit

- Status: accepted (the user asked for more optimisations and features in 0.3 while away; these follow the
  candidates named in trial 0010, and add no new principle or dependency)
- Motivation: in trial 0010 the change met its target (1.44× Nuxt) and the build did not (1.64×). The build
  transcripts show three remaining costs:
  - **Reading the scaffold:** both runs printed every generated file after `hozu add feature` (16 k characters),
    only to find the texts to change.
  - **Checking attributes:** both runs started the server once, to check attributes such as `aria-pressed`, because
    `hozu get` prints only the visible text.
  - **`patterns.md`:** it was read before scaffolding (part of 12 k), although the scaffold already contains those
    patterns.

## Decision 1 — `hozu get` / `hozu post` can show elements and forms
- **`--select <selector>`** (repeatable) prints each matching element of the final page, one line each: its tag, its
  attributes and its text (up to 120 characters).
  - The selector grammar is deliberately small: `tag`, `#id`, `[attr]`, `[attr=value]` and `tag[attr=value]`.
  - `--select button` shows `aria-pressed`, `--select '[role=alert]'` the alerts, `--select a` the links and their
    `href`s.
- **`--forms`** lists each form that posts: its action, its fields with their default values, and its submit
  buttons. This is exactly what `hozu post --field` / `--button` need.
- **JSON:** the step gets `elements` and `forms`, extending `request.schema.json`.

## Decision 2 — `hozu add feature` prints what to edit
- **After writing the files,** it prints:
  - one line per generated declaration kind (events, queries, mutations, states, views, contracts);
  - the **texts to adapt**, each with `file:line`: headings, labels, button texts, empty and error messages. A
    spec's wording is usually the only thing to change.
- **JSON:** `texts: [{ file, line, text }]`, extending `add.schema.json`.

## Decision 3 — the guides say not to read what the tools summarise
**`SKILL.md` and the app guide:**
- after `hozu add feature`, do not print the generated files: edit the texts it lists, and use `hozu map` for the
  structure;
- `patterns.md` is only for what the scaffold does not cover.

**`changing.md`:** check attributes with `hozu get --select`, never with a server.

## Measurement
Trial 0011 repeats trial 0010 (two runs per arm and step, Nuxt re-run). Targets stated before the run (means):
- build ≤ 1.5× Nuxt;
- change ≤ 1.5×;
- correctness in every run.

## Verification
- The gate is green; parity 24/24.
- **Tests:**
  - `--select` and `--forms` on the scaffolded app (buttons with `aria-pressed`, the per-item forms and their
    buttons);
  - the texts listed by `hozu add` exist at the given lines;
  - schemas for the extended outputs.

## Implementation notes
- **`--select`:** elements are found by tag and attributes; an element's text runs to its matching closing tag.
  Scripts, styles and templates are ignored. The human output omits `class`, and the JSON keeps every attribute.
- **Texts from `hozu add`:**
  - **Collected:** string literals in the views' child arrays and the `label`s of filter buttons (the machine's
    state names in `when([...])` are skipped), and the message constants of `model.ts`.
  - **Excluded:** contract data and enum values.
- **SKILL.md:** stays at 10,239 bytes.
- **Gate:** green, 264 tests. The runtime did not change, so parity keeps its 24/24 from ADR 0028.

## Results
**Trial 0011** (`docs/trials/0011-inspect-and-summaries.md`):
- build **2.28×** and change **1.53×** Nuxt (both targets missed), correctness in every run;
- across the four 0.3 runs: 1.96× and 1.48×.

The tools were used. The guidance not to print the generated files, and `hozu map` as the first step of a change,
were not followed: agents read the code they edit. One scripted-edit mistake in a build accounts for much of the
difference from trial 0010.

The additions stay as working tools. The next lever is the size of the code an agent reads.
