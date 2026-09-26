# ADR 0027 — 0.2: a cheaper loop for agents (check, try, scaffold, a leaner skill)

- Status: accepted (the user approved the 0.2 direction)
- Motivation: the published 0.1.0 costs a fresh agent **2.09× Nuxt to build** the task board and **1.43× to change
  it**, with equal correctness (trial 0008). The trial transcripts show where the cost is:
  - **Writing:** output tokens are about 27% of the build's weighted cost, much of it boilerplate: a feature's
    machine, view, contracts and resolver wiring.
  - **Reading before writing:**
    - `SKILL.md`, the whole example app and `patterns.md` are read up front;
    - the change agent rereads the whole skill and the whole app.
  - **Trying the app:** starting a server, `curl`, and stopping it again cost 2–4 turns per step.
    - One `curl -i` printed an 18 k-character page.
    - Trial 0007's agent spent 3 turns finding out that a native form post needs an `Origin` header and the form's
      `__hozu` field.

## Decision 1 — `hozu check`
One command for everything an agent must run after an edit.
- **What it runs:** the app's own TypeScript (`tsc --noEmit -p .`, resolved from the app) and `hozu validate`.
- **Human output:** type errors as `file:line  message`, then the validator's diagnostics, then one summary line.
  Exit 1 on any error.
- **`--json`:** `{ ok, types: { ok, errors }, validate }` (schema `check.schema.json`).
- **`--update-lock`:** passed on to validate.
- **When the app has no TypeScript:** the type step is reported as skipped with the install command. It never
  passes silently.

## Decision 2 — `hozu get` and `hozu post`: try the app without a server
Both run the real handler in-process (`@hozu/testing`) with the app's `createResolvers()` from `server.ts`.
- **`hozu get <path>...`:** one line per request (`GET /tasks/t1 → 200`), then the title, every `role="alert"`
  text, and the visible text. The text is capped at 1,500 characters (`--full` removes the cap).
- **`hozu post <path> --field name=value ... [--next <path>]...`:**
  - **It fills the form like a browser.** It reads the page, picks the native form whose fields include the given
    names, fills the other fields from their defaults (input values, selected options, textarea text), and posts to
    the form's action. The agent never needs `__hozu` or `Origin`.
  - It follows the redirect and prints the final page. Then it requests each `--next` path in the same process, so
    in-memory data written by the post is still there.
  - Cookies set on the way are sent on the following requests.
- **Options:** `--session '<json>'` supplies a session value for user-scoped apps. `--json` prints the steps
  (schema `request.schema.json`).
- **Why in-process:** the server's own `serve.ts` is still how the app runs. `get`/`post` are for checking behaviour,
  and they cost one turn and a few hundred characters.

## Decision 3 — `hozu add feature <name> [--page <path>]`
It generates the shape of the verified example, so an agent edits working code instead of writing it:
- `features/<name>/model.ts`: an item schema, a list query and an add mutation (tag and invalidation included), and
  a machine with `idle` and a busy `adding` state (`ignore`, and `done` / `Invalid` / `Unexpected` handled);
- `features/<name>/views.ts`: a view with a no-JS form, field errors and the list, the contracts for every
  transition, and `feature({ declarations })`;
- `features/<name>/server.ts`: `<name>Resolvers(implement)`, backed by an in-memory store.

It then wires the feature in:
- `hozu.config.ts` gets the import and the entry in `features`;
- `server.ts` gets `...<name>Resolvers(implement)`;
- **`--page /path`** also adds a route to `routes.ts` and a page to `hozu.config.ts`.

**Names:** they come from `<name>`: `tasks` → `Task`, `listTasks`, `addTask`, `tasksTag`.

**Existing files:**
- It refuses an existing `features/<name>/`.
- It edits `hozu.config.ts`, `routes.ts` and `server.ts` only when they have the shape `create-hozu` writes. Otherwise
  it prints the lines to add and changes nothing.
- The result always type-checks and validates, which a test checks for a fresh app.

**Principle check:**
- Nothing is generated at build time and no magic is added (principle 2). The scaffold writes ordinary source that
  the agent owns.
- Contracts are written by the scaffold as explicit statements. Principle 5 forbids deriving them from the machine,
  and this does not: the scaffold's contracts state the template's intent and are edited with it.

## Decision 4 — the skill points, instead of asking to read everything
- **`SKILL.md`, the checks section:** becomes `hozu check`, and trying the app becomes `hozu get` / `hozu post`.
  Starting `serve.ts` is only for running the app.
- **Building:** start with `hozu add feature <name> --page /`, then edit. The example app is named per need: "a
  detail page with a 404: `example/features/bookmarks/views.ts`, `Detail`". It is no longer "copy the shape of
  `example/`".
- **`changing.md`:** read the files the change touches, then `hozu check`. Rereading the skill is replaced by the
  table of where each change goes.
- **The app guide** (`CLAUDE.md` / `AGENTS.md` from `create-hozu`) names the same loop:
  `hozu check`, then `hozu get` / `hozu post`.

## Decision 5 — measure the way a user works
The next trial runs **Claude Code itself in the app directory** (`claude -p`), with an app created by the 0.2
`create-hozu` from packed tarballs.
- The skill is discovered from `.claude/skills/hozu`, as it is for a user.
- Same task, change, acceptance, model and weighting. The transcripts come from `--output-format stream-json`.

**Targets stated before the run:**
- build ≤ 1.3× Nuxt;
- change ≤ 1.1×;
- correctness 12/12, 6/6, 12/12.

## Verification
- The gate is green; parity 24/24; the rehearsal from packed tarballs covers `check`, `get`, `post` and
  `add feature`.
- **New tests:**
  - `check` on a clean app and on an app with a type error and a diagnostic;
  - `get` / `post` against the bookmarks example: a duplicate title shows its alert, an added bookmark appears
    after the redirect, `--next` sees it;
  - `add feature` on a fresh `create-hozu` app, with and without `--page`, then `check` is clean;
  - schemas for the new JSON outputs.

## Results
- **Gate:** green on the first run; 258 tests, P7 7,772 B (`data-hozu-ready` adds 18 B). Parity 24/24.
- **Implementation notes:**
  - **`--next`, not `--then`:** `hozu post` takes further steps as `--next`, because a parsed option object with a
    `then` property is thenable (Biome's `noThenProperty`).
  - **`data-hozu-ready`:** `<html>` gets it once hydration completes, and `reference.md` documents it for browser
    tests. It replaced a retry loop in the Chromium feed test, which had itself raced: a slow first load plus a
    second click loaded two pages.
- **Trial 0009** (`docs/trials/0009-claude-code-in-the-app.md`), Claude Code in the app directory, with Nuxt
  re-run the same way:
  - build **2.05×** (target ≤ 1.3×, missed);
  - change **2.34×** (target ≤ 1.1×, missed);
  - correctness equal.

  The loop worked. The cost is in reading before writing. Two defects were found:
  - `hozu post` cannot select a form that only has a submit button;
  - the template's `check` script is stale.
- **Fixed before publishing 0.2.0:**
  - `hozu post --button <label>` and `'POST <path> @Label'` steps select a form by its submit button;
  - the template's `check` script is `hozu check`.

  The gate is green, with 259 tests.
