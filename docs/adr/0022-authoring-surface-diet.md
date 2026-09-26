# ADR 0022 — A smaller authoring surface

- Status: accepted
- Motivation: trial 0006 measured Tenon at **1.67× Nuxt to build and 1.39× to change** the task board, with the
  same model and equal correctness.
  - The app is 2.3× the source of the Nuxt app (21.1 KB vs 9.2 KB).
  - A change touches 8 files against 6.
  - The skill every session reads first grew from 12.4 KB to 20.2 KB across Phases 6–9.

## Where the extra source is (trial 0006 app, 20.6 KB)
| Part | Bytes | Share | What it contains |
|---|---|---|---|
| `contracts.ts` | 3,888 | 19% | full `given`/`expect` contexts repeated in every contract |
| `views.ts` | 6,963 | 34% | comparable to Nuxt's two pages (6.4 KB) |
| `machine.ts` + `events.ts` | 2,897 | 14% | Nuxt keeps this state inline in the page |
| `tenon.config.ts` | 1,579 | 8% | 13 lines of `null` / `false` / empty values |
| `effects.ts` | 1,363 | 7% | `errors: {}` and the tags of every declaration |
| `feature.ts` | 1,057 | 5% | every declaration listed a second time, and 6 empty export lists |
| other (`schemas`, `routes`, `server`) | 2,891 | 14% | comparable to Nuxt |

About a third of the source says nothing specific to this app: empty values, repeated registration and repeated
contexts. The views and the data are not the problem.

## 1. Absent values are omitted
| Option | Trade-off |
|---|---|
| a. Keep every field required (today) | Nothing can be forgotten silently, but every project, page, feature and query carries empty values |
| b. Make them optional and also accept `null` | Two spellings for "none" (against principle 1) |
| **c. Optional, and absence is the only spelling** | One form; the type rejects `null` where the field may be omitted |

**Decision (c).** Only fields whose "empty" value means *nothing configured* become optional:
- **project:** `http`, `env`, `notFound`, `error`, `session`, `styles`;
- **site:** `locales`, `offline`, `icon`, `themeColor`;
- **page:** `assert`, `entries`, `head.redirects`, `head.query` / `head.input`, and the `head.render` fields
  `description`, `type` (default `website`), `image`, `published`, `noindex` (default `false`);
- **feature:** `styles`, `messages`, `widgets`, `imports`, `exports` and each of its lists, `intent.invariants`;
- **query / mutation:** `errors`, `tags`, `invalidates`;
- **view:** `machine` and `route`. No machine means a static view with 0 JS, and no route means no params: both are
  "nothing configured", not a hidden choice.

Fields that **decide behaviour stay required**, because a default would be a hidden decision:
- a query's `scope` and `freshness` (principle 8: rendering is derived from them);
- a machine's `initialContext` and `initial`;
- a route's `params` and `search` schemas: they type every link to the route.

The IR keeps every field, normalised. So validators, hashes and the lock file do not change, and principle 1 holds
where it matters: one IR per program.

## 2. A feature registers its declarations by kind
| Option | Trade-off |
|---|---|
| a. One record per kind, as today (`events: {…}, queries: {…}, …`) | Each declaration is written twice: once where it is declared and once in its kind's record |
| **b. `feature({ id, intent, declarations: { ...effects, ...events, ...views, ...contracts, machine } })`** | Declarations are branded with their kind, so the build sorts them. Names stay the keys |

**Decision (b).** Declarations are already branded with their kind, so one record is enough:
- a declaration of an unknown kind is TN014;
- more than one machine is TN013.

`feature.ts` shrinks to a few lines, and "declared but never registered" (TN007) mostly disappears. `imports` and
`exports` stay explicit, because they are the feature boundary (principle 6); they are simply optional when empty.

## 3. Contracts state only what changes
| Option | Trade-off |
|---|---|
| a. Generate contracts from the machine | **Rejected: it breaks principle 5.** A contract copied from the machine always passes, so it would stop being the check that behaviour matches intent |
| **b. Shorter contracts with the same strength** | Same checks, less text |

**Decision (b):**
- **`given.context` may be omitted**, meaning the machine's `initialContext`.
- **`expect.changes`** replaces `expect.context`. It is a patch over `given.context`, and every field it does not
  mention must be **unchanged**, so the check is exactly as strict as a full context.
- **`expect.effects` may be omitted**, meaning none.

In the trial app's contracts, most expectations shrink from a full context to one or two fields.

## 4. The skill is split by need
- **`SKILL.md`** becomes the core: the mental model, one feature end to end, views, the machine, contracts and the
  checks. The target is ≤ 10 KB (today 20.2 KB).
- **`reference.md`** holds everything added in Phases 6–9: languages, env, images and content, deployment, preview,
  PWA, HTTP rules, route grammar and soft navigation. `SKILL.md` names what it holds, so an agent opens it only when
  the task needs it.
- **Recommended layout:** two feature files instead of seven.
  - `model.ts`: schemas, events, effects and the machine;
  - `views.ts`: views and contracts.

  This is only a recommendation; any split still works. `examples/bookmarks` follows it.

## Principle check
- **Principle 1:** one spelling per concept, and optional fields have no `null` spelling.
- **Principle 2:** absent means absent, never a hidden choice. Every behaviour-deciding field stays required.
- **Principle 5:** contracts stay hand-written statements of intent, only shorter.
- **Principle 6:** imports and exports stay explicit.

## Migration
- All examples, tests, benchmarks and the skill move to the new forms in the same phase.
- Old spellings become type errors: `http: null` does not type-check, and neither do per-kind records. There is no
  alias period (principle 1).
- The IR does not change, so every lock file stays valid.

## Verification and target
- The gate stays green, parity stays 24/24, and A4 is reported.
- **Re-run the trial-0006 Tenon arm** (same model, parser, prompts and acceptance) against the same-model Nuxt
  numbers (98 k build, 88 k change). Stated before the run:
  - build ≤ 1.2× Nuxt;
  - change ≤ 1.1× Nuxt;
  - app source ≤ 1.6× Nuxt.

  If a target is missed, the report says so and says which part of the surface is still expensive.

## Implementation notes
- **Migration:** a brace-aware codemod rewrote every `project`, `ui.page`, `ui.view`, `query` / `mutation`,
  `feature` and `contract` call in examples, tests and benchmarks. Six contracts used the old unchecked forms
  (`context: null` / `effects: null`) and were migrated by hand:
  - the example ones now state their effects explicitly;
  - the TN011 fixture moves its `Math.random()` into a guard, so its contract can state the result.
- **The IR is unchanged:** every committed lock file still checks.
- **Diagnostics:** TN016 now prints a contract without `given.context`, with `changes` listing only the assigned
  fields, and with `effects` only when there are any. The fixes of TN003/TN007 and the messages about machines and
  messages name `declarations`.
- **Tests:** new core tests cover the `changes` merge, the default `given.context`, classification by kind, and
  TN013/TN014 for `declarations`. Type checks cover the rejected old spellings.
- **Skill:**
  - `SKILL.md` is 10.0 KB (from 20.2 KB); `reference.md` (8.7 KB) holds everything past the core;
  - `examples/bookmarks` is two feature files (`model.ts`, `views.ts`), and `Show` moved to `routes.ts` to avoid
    an import cycle.
- **Source size:**

  | App | Before | After |
  |---|---|---|
  | bookmarks, rewritten by hand | 17.1 KB | 14.8 KB (−14%) |
  | cart, migrated mechanically | 30.4 KB | 29.2 KB (−4%) |
  | trial-0006 app, migrated mechanically | 21.1 KB | 20.5 KB (−3%) |

  A mechanical migration keeps full `given` contexts and repeated constants. The saving depends on writing in the
  new style, which the trial re-run measures.
- **Gate:** green.
  - A4 56,636 (from 57,192);
  - P7 7,676 B and P8 1,863 B, unchanged;
  - P2 exponent 1.124.
