# ADR 0012 — Checking literals and internal links

- Status: accepted (the user approved step 1 of trial 0002)
- Context: trial 0002 found that Tenon missed typos inside string literals, the most common AI mistake, while
  plain Vue caught them. Examples: `op.eq(ctx.tab, 'desing')`, `ui.send(SelectTab, { tab: 'desing' })` and
  `type: 'sumbit'`. It also missed raw internal `href` strings.

## Options
| Option | Pro | Con |
|---|---|---|
| A. Types only | errors appear in the editor | hand-edited IR and `--json` patches stay unchecked; TypeScript cannot see guards |
| B. Validator only | covers the IR, the source of truth | errors appear later, only at validate time |
| **C. Both** | editor feedback, plus a check on the IR | two places to keep aligned |

## Decision: C
- **Types**:
  - Builders infer generic types from the declaration only, using `NoInfer`. A literal can no longer widen the
    type: this covers `op.eq/neq/lt…` (right side), `op.set/append/removeWhere`, `ui.send`, `ui.query` input,
    `ui.link`, `invoke` input and `ui.use`.
  - Guards narrow at runtime, but TypeScript cannot see that, so `op.set` also accepts an expression whose only
    extra member is `null`. The contract runner still checks context against its schema (TN017).
  - Enumerated HTML attributes are typed from a table in `scripts/gen-dom.ts` (the table is also emitted as
    `attrValues`). Examples: `button[type]`, `input[type]`, `form[method]`, `loading`, `decoding`,
    `referrerpolicy` and `dir`. Dynamic values stay allowed; literal strings must be one of the keywords.
    `command` also accepts custom `--name` commands.
- **TN031 invalid-literal**: every literal is checked against the JSON Schema it flows into:
  - guard comparisons
  - assigns
  - invoke and query inputs
  - event payloads sent from views
  - link params
  - `fn` guard arguments
  - enumerated attributes

  The check covers `enum`, `const`, type, `anyOf`/`oneOf`/`allOf`, object properties and array items. The
  patch replaces the literal with the closest allowed value.
- **TN032 untyped-internal-link**: a string `href` on `a`/`area` that starts with `/` must be `ui.link(route,
  params)`. When the path matches a route, the patch rewrites it to the link. When it matches no route, the
  closest route path is suggested. Excluded: `//host`, `/_tenon/*` (assets) and files, which use `ui.asset`.
  A query string or fragment is reported without a patch until routes support them (ADR 0011 item 1).

## Consequences
- The mistake injection of trial 0002 now catches 12 / 12 (Nuxt 5 / 12).
- The run environments are cached per validation (`Ctx.envs`), so TN008 and TN031 share them. P2 stays within
  budget: 433 ms for 1000 features, scaling exponent 1.12.
