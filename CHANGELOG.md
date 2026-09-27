# Changelog

## 0.4.0 — what the official site found

Gaps found while building [hozu.org](https://hozu.org) with Hozu (ADR 0032).
- **No flash between pages.** The stylesheet turns on cross-document view transitions, so links between pages
  without islands cross-fade instead of flashing, with no JS (Chrome/Edge 126+, Safari 18.2+; other browsers are
  unchanged). With `prefers-reduced-motion` the pages swap without animation. Turn them off with
  `@view-transition { navigation: none; }` in your stylesheet.
- **Static output contains every file its pages link to.** `exportStatic` and `hozu build` now write
  `/manifest.webmanifest`, and `/sw.js` with `/_hozu/sw-register.js` when `site.offline` is set. Before, pages linked
  them but only the server generated them.
- **`head.image` accepts `ui.asset(...)`,** for a share image on a static host. It is linked by absolute URL and
  copied with the other assets.

## 0.3.0 — less reading, less rewriting

- **`hozu map`:** a compact outline of the app with `file:line` for every entry. It covers routes and their pages,
  queries and mutations with their errors and tags, events and their fields, and the machine's states with their
  transitions, `invoke`, `ignore` and `after`, views and contracts. The example apps map in about 1.2 KB. `--json`
  follows `map.schema.json`.
- **`hozu add feature <name> --with detail,toggle,filter,remove`:** composable parts on top of the list and add
  form:
  - `detail`: a detail page with a 404, and its route, head and `entries`;
  - `toggle`: a done field and a per-item button that works without JS;
  - `filter`: in-page All / Open / Done buttons and an empty state;
  - `remove`: a per-item delete.

  Each of the 16 combinations checks clean in a fresh app.
- **Recipes in `changing.md`,** verified by applying them to a scaffolded app in a test:
  - an enum field chosen in the add form;
  - an action button that works on many items;
  - a field shown on the detail page;
  - adding a detail page.

  The change loop starts with `hozu map`.
- **`hozu get` / `hozu post` show more without a server:**
  - `--select <selector>` prints matching elements with their attributes. The selectors are `tag`, `#id`,
    `[attr]`, `[attr=value]` and `tag[attr=value]`, e.g. `button[aria-pressed=true]`.
  - `--forms` lists each form's action, fields with their defaults, and submit buttons.
- **`--with auth`:** sign-in and sign-out (`features/account`), a signed `HttpOnly` session cookie in `serve.ts`,
  per-user queries and resolvers, and a redirect to `/login` when signed out. A second feature with `auth` reuses the
  account. `hozu get` / `hozu post` keep a real session cookie across steps, so sign-in flows can be tried without a
  server.
- **`hozu add feature` prints what to edit:** the generated declarations by kind, and every user-facing text with its
  `file:line`. The guides say not to print the generated files.

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
