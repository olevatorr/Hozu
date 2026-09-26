# ADR 0026 — The framework is renamed Hozu before its first release

- Status: accepted (the user chose the name and asked for the repository to be renamed too)
- Motivation: Tenon is also the name of Tenon.io, an accessibility testing service, and of a Rails CMS that owns the
  unscoped npm package `tenon`. Renaming is free before 0.1.0 is published, and a breaking change afterwards.

## Names considered
Each candidate was checked on npm (the name, `create-<name>` and its scope), on GitHub and with a web search.
Rejected names and why:

| Name | Rejected because |
|---|---|
| Jigwork | The user found an existing software product with this name |
| Joinwright | A quoting software company (joinwright.com) |
| Kerfline | Several software projects use it |
| Tendon | `tendon-cli` is a Claude Code task tool whose binary is `tendon`; the name is also one letter from Tenon |
| Kigumi, Tsugite, Nuki, Tsugi, Kumi, Joyn | Taken on npm or used by popular GitHub projects |
| Kerfy, Tenu | Close to Kerf (a UI framework), and to TenU, tenui and the TEN framework |

**Chosen: Hozu**, from ほぞ (hozo), the Japanese word for "tenon".
- The name keeps the meaning of the working name and moves it to another language, as Vue did with "view".
- `hozu`, `create-hozu` and the `@hozu` scope are free on npm.
- A web search found no software named Hozu. The only near match is Hozo, a Common Lisp ontology tool.
- A trademark search (classes 9 and 42) is the user's step before promotion.

## Decision — rename everything that is not history
| What | Before | After |
|---|---|---|
| npm scope | `@tenonkit/*` (ADR 0025) | `@hozu/*` |
| App creator | `create-tenon` | `create-hozu` |
| CLI binary | `tenon` | `hozu` |
| Config and lock files | `tenon.config.ts`, `tenon.lock.json` | `hozu.config.ts`, `hozu.lock.json` |
| Framework URLs, attributes and globals | `/_tenon/`, `data-tenon-*`, `__TENON_DEV__`, `tenon-payload`, `tenon_preview` | `/_hozu/`, `data-hozu-*`, `__HOZU_DEV__`, `hozu-payload`, `hozu_preview` |
| Diagnostic codes | `TN001`–`TN043` | `HZ001`–`HZ043` |
| Agent skill | `.claude/skills/tenon`, skill name `tenon` | `.claude/skills/hozu`, skill name `hozu` |
| Repository | `github.com/olevatorr/Tenon` | `github.com/olevatorr/Hozu` (GitHub redirects the old URL) |

**Kept as they are:**
- ADRs 0001–0025, `docs/trials` and `docs/benchmarks`. They are history and keep the names they were written with.
- The local checkout directory, which the user may rename.

## Consequences
- The npm organisation `tenonkit` created for ADR 0025 is no longer used. The user creates the organisation `hozu`
  before publishing.
- **Lock files:** their behaviour hashes do not change, and every lock still checks.
- **IR hashes:** they change, because the IR contains the renamed framework strings (for example `data-hozu-visible`).

## Verification
- The gate is green, parity stays 24/24, and the example locks check.
- The release rehearsal of ADR 0025 is repeated with `create-hozu` and the `hozu` binary.

## Results
- **The replacement:** it ran over 349 text files outside `docs/`, plus the renamed paths (the skill folder, config
  and lock files, `create-hozu`, the `hozu` binary, the blog's two example post slugs). Nothing outside `docs/`
  still mentions Tenon, except the README line that explains the name.
- **Examples:** all eight validate, and every lock checks.
- **Two tests changed because of the name itself:**
  - the blog post slug `hozu-roadmap` now sorts before `islands-explained`;
  - an upload fixture's text `hello hozu` is one byte shorter.
- **The Chromium feed test:** it timed out under full-suite load twice (ADR 0025 and here). A click sent before
  hydration is dropped, so the test now clicks until the first page loads. This is safe, because the machine's
  guard ignores a repeated cursor.
- **Gate:** green, 255 tests, P7 7,753 B. It passed on the third run: the first run failed on the two tests above,
  the second on the feed flake.
- **Rehearsal:** repeated with the 18 packed tarballs. `create-hozu --agent both` created the app. `tsc`,
  `hozu validate`, `hozu build` (with `dist/server/render.js`), `hozu skill` and `hozu plan` passed, and the server
  answered with the page.
- **Parity:** 24/24 identical after the rename.
