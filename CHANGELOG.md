# Changelog

## 0.2.0 — a cheaper loop for agents

### Commands
- **`hozu check`:** type-checks the app with its own TypeScript and runs every rule and contract. One command and
  one summary line; `--json` follows `check.schema.json`.
- **`hozu get <path>...`:** requests pages in-process, with no server. It prints the status, title, every
  `role="alert"` text and the visible text (capped at 1,500 characters).
- **`hozu post <path> --field name=value [--next <step>]...`:** fills the page's form like a browser, posts it,
  follows the redirect, then runs the next steps in the same process.
  - A step is `'/path'`, `'GET /path'`, `'POST /path a=1&b=2'` or `'POST /path @Button label'`.
  - `--button <label>` picks a form by its submit button, for action forms without fields.
- **`hozu add feature <name> [--page <path>]`:** scaffolds a working feature and wires it into `hozu.config.ts`,
  `server.ts` and, with `--page`, `routes.ts`:
  - a list query and an add mutation;
  - a machine with a busy state;
  - a no-JS form with field errors;
  - the contracts;
  - in-memory resolvers.

### Other changes
- **The skill and the app guide teach this loop:** `add` → edit → `check` → `get` / `post`. `patterns.md` points
  at the part of the example each pattern uses.
- **`create-hozu` apps** also depend on `@hozu/testing`, which `get` / `post` use. Their `check` script is
  `hozu check`.
- **`<html data-hozu-ready>`** is set once the page has hydrated, for browser tests.

## 0.1.0 — first public release

All packages are published under `@hozu/*`, plus [`create-hozu`](https://www.npmjs.com/package/create-hozu).
The framework was developed under the working name Tenon (see `docs/adr` 0001–0025).

### Authoring
- **Declarations:**
  - features, one state machine per feature, typed events, queries, mutations, tags, `fn`s, views, widgets and
    messages;
  - `feature({ id, intent, declarations })` sorts declarations by kind (ADR 0022).
- **Contracts:** given / when / expect for every transition. `expect.changes` states only what changes. A behaviour
  lock catches drift (HZ016, HZ018).
- **Views:** typed element trees with every HTML/SVG element, typed attributes and DOM events, `toggle` and `vars`,
  Tailwind classes checked against the generated CSS, `ui.if`, `ui.each`, `ui.query` and motion.
- **Routes:**
  - typed `params` and `search`, with the `:x?`, `:x+` and `:x*` modifiers;
  - `ui.link` is the only form of an internal URL;
  - soft navigation keeps UI alive across links.
- **Forms:** work without JavaScript. Field errors come from the `Invalid` error, and there is a pattern for
  optimistic items.
- **Other features:**
  - i18n with typed messages and `Intl` formatting;
  - typed `env`;
  - sessions, CSP and cross-site POST checks;
  - Markdown collections;
  - image `srcset` and share images;
  - preview mode, PWA and an offline page;
  - `@hozu/testing`.

### Rendering
- **Render plans are derived per node:** static, ISR, SWR, streamed or client. User-scoped data cannot reach a
  cacheable region.
- **Server HTML comes from generated JavaScript** (ADR 0024). `hozu build` writes it for edge runtimes.
- **The client runtime** hydrates only machine-bound islands. It is 7.5 KB gzipped, with a compact payload and
  modulepreload (ADR 0023).

### Tools
- `hozu validate | inspect | graph | explain | impact | plan | build | skill`, all with `--json` and JSON Schemas.
- 43 diagnostic codes, each with a location, a cause and a fix.
- `create-hozu --agent claude|agents|both`: writes `CLAUDE.md` or `AGENTS.md`, plus the versioned authoring skill
  with a verified example.

### Requirements
- Node 22.18 or newer.
