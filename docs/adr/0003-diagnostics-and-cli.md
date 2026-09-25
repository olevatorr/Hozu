# ADR 0003 — Diagnostics format and agent-facing CLI

- Status: accepted
- Phase: 0

## Context
Agents consume Tenon through the CLI. Output must be structured, stable, schema-validated, and every error must
say where it is, why it is wrong, and how to fix it — in a form a program can apply.

## Options for fixes
1. Prose only — easy, but not machine-applicable.
2. Source text edits — ideal for agents, but TS source is not canonical (formatting, helper functions).
3. JSON Patch (RFC 6902) against the IR + a TS snippet + a source location.

**Chosen: 3.** The IR patch is verifiable (the mistake catalog proves applying it removes the diagnostic); the
source location and snippet tell an agent where and what to write.

## Diagnostic shape
Every key is always present (no optional keys), so agents never branch on absence.
```ts
interface Diagnostic {
  code: `TN${number}`; severity: 'error' | 'warning'; message: string
  location: { feature: string | null; pointer: string; source: { file: string; line: number; column: number } | null }
  cause: string
  fix: { summary: string; snippet: string | null; patch: JsonPatchOp[] | null } | null
}
```
`pointer` is a JSON Pointer into `ProjectIR`; `source` is resolved from the sidecar by the nearest ancestor pointer.
Did-you-mean suggestions use edit distance over the candidates in scope.

## Codes (Phase 0)
| Code | Name | Stage |
|---|---|---|
| TN001 | unreachable-state | validator |
| TN002 | unhandled-event | validator |
| TN003 | undeclared-effect | build + validator |
| TN004 | unhandled-declared-error | validator |
| TN005 | illegal-view-event | validator |
| TN006 | boundary-violation | validator |
| TN007 | dangling-reference | build + validator |
| TN008 | invalid-reference-path | validator |
| TN009 | shadowed-transition | validator |
| TN010 | dead-end-state (warning) | validator |
| TN011 | nondeterministic-build | cli |
| TN012 | schema-adapter-mismatch | build |
| TN013 | duplicate-declaration | build |
| TN014 | invalid-builder-output | build |
| TN015 | contract-failed | contracts (ADR 0004) |
| TN016 | uncovered-transition | contracts (ADR 0004) |
| TN017 | invalid-contract-data | contracts (ADR 0004) |
| TN018 | behavior-changed-without-contract | contracts (ADR 0004) |
| TN019 | ineffective-invalidation (warning) | validator (ADR 0005) |
| TN020 | user-scope-without-session | validator (ADR 0005) |
| TN021 | missing-resolver | data runtime (ADR 0005) |
| TN022 | user-data-in-cacheable-region | validator (ADR 0006) |
| TN023 | render-assertion-violated | validator (ADR 0006) |

## CLI
- `tenon validate [feature] [--json] [--config <path>]` → `{ ok, hash, summary: { errors, warnings }, diagnostics }`;
  exit 1 on any error, 2 on usage/config errors (`{ error: { code, message, suggestions } }`). Builds twice without
  source capture and compares hashes (`TN011`, located at the first differing pointer); only if there are
  diagnostics does it rebuild with capture to attach `file:line:column`.
- Since Phase 1, `validate` also runs contracts and reports `coverage` per feature and the `lock` state
  (`missing | checked | updated | skipped`); `--update-lock` rewrites `tenon.lock.json` only when clean.
- `tenon explain <feature>.<state> [--json]` → transitions in/out rendered as pseudo-code, covering contracts,
  the invoke with its errors, and the events visible views can send in that state.
- `tenon impact <feature>.<symbol> [--json]` → tags, affected queries (`exact` / `param-dependent`), the
  mutations that invalidate it, and every state/view node that uses it (ADR 0005 D5).
- `tenon plan <route> [--json]` → the derived render plan: regions with mode/interval, islands, `js`,
  `cacheable`, per-node plans (ADR 0006).
- `tenon inspect <feature> [--json]` → `{ feature, hash, summary, ir }`.
- `tenon graph <feature> [--json]` → `{ feature, nodes, edges }`; text mode prints Mermaid `stateDiagram-v2`.
- Argument parsing with `node:util` `parseArgs`; config is loaded with native `import()` (ADR 0002 D9).
- Output JSON is canonical (sorted keys). Schemas are published in `@tenon/cli/schema/*.schema.json` and
  `@tenon/core/schema/project-ir.schema.json`, generated from the TS types by `pnpm schema`.

## Consequences
- Adding a code requires: registry entry, rule, fix, mistake-catalog case (ADR 0001).
- Human output is derived from the JSON; there is no human-only information.
