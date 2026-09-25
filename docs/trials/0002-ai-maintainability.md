# Trial 0002 — Is Tenon actually easier for an AI to write and maintain? (before Phase 6)

Question from the user: confirm that Tenon really helps AI authoring and maintenance before building more.
Method: the same page exists twice, `examples/showcase` (Tenon) and `bench/parity/nuxt` (Nuxt 4.5, pixel
identical, docs/benchmarks/0002). Twelve mistakes that AI agents commonly make were injected one at a time into
the equivalent spot of each version. Each version was then checked with its standard tooling:
- Tenon: `tsc` + `tenon validate`
- Nuxt: `vue-tsc` on `nuxi prepare` output

Caveat: this measures what the toolchains *catch*, not how well a fresh agent learns the API.

## Mistake injection
| # | Mistake | Tenon | Nuxt |
|---|---|---|---|
| M1 | typo in a state value: compare `tab` with `'desing'` | ✖ **missed** | ✔ TS2367 |
| M2 | invalid value sent: `SelectTab { tab: 'desing' }` (payload is an enum) | ✖ **missed** | ✔ TS2820 |
| M3 | misspelled Tailwind class `font-semibld` | ✔ TN026 | ✖ |
| M4 | `img` without width/height (layout shift) | ✔ TN028 | ✖ |
| M5 | user input rendered as HTML (XSS) | ✔ TN030 | ✖ |
| M6 | link to a route that does not exist, written as a plain string `'/abuot'` | ✖ | ✖ |
| M7 | misspelled attribute `minlenght` | ✔ TS2561 + TN014 | ✖ |
| M8 | wrong prop type passed to a widget | ✔ TS2322 | ✖ |
| M9 | list key that does not exist | ✔ TS2345 + TN008 | ✔ TS2339 |
| M10 | stale read after renaming a state field | ✔ TS2339 + TN008 | ✔ TS2339 |
| M11 | behaviour changed silently ("reverse" no longer reverses) | ✔ TN018 | ✖ (no tests) |
| M12 | invalid enumerated attribute value `type: 'sumbit'` | ✖ **missed** | ✔ TS2820 |

Totals:

| | Tenon | Nuxt |
|---|---|---|
| Mistakes caught | **8 / 12** | 5 / 12 |
| Caught only by this toolchain | M3, M4, M5, M7, M8, M11 | M1, M2, M12 |

Both toolchains missed M6.

### What Tenon misses, and why
Tenon misses mistakes in the most common AI error class, typos inside string literals. Here plain Vue is
stricter.
- **M1**: `op.eq(left: Val<T>, right: Val<T>)` infers `T` from both sides, so `'desing'` widens `T` to `string`.
  The validator does not compare literals against the JSON Schema `enum` either.
- **M2**: `ui.send` payload values are typed loosely, and no rule checks literal payloads against the event
  schema.
- **M12**: enumerated HTML attributes (`type`, `method`, `loading`, `autocomplete`…) are typed as any attribute
  value.
- **M6**: a raw string `href` is still allowed for internal paths. `ui.link` is the typed way, but nothing forces
  its use.

## Diagnostics and reading cost
- TypeScript errors stay short and readable, for example M9: `Argument of type '"uid"' is not assignable to
  parameter of type '"body" | "hue" | "id" | "title"'`. No deep-generic error walls were seen (risk R3).
- Validator diagnostics are about 1.0–1.6 KB each as JSON: location, cause and an applicable patch. That is
  about 7× a Vue TS error, but it includes the fix.
- Machine understanding without reading files: `tenon explain site.ready` is 1.7 KB and describes every
  transition out of the state.

## Writing cost (output tokens)
| | Tenon | Nuxt |
|---|---|---|
| Source for the same page | 23.3 KB (views 15.5, machine 1.8, contracts 1.2, schemas/events 1.4, widgets and effects 3.4) | 13.4 KB (index.vue 10.6, Widget.vue 1.3, about 1.1, config 0.4) |

Tenon costs **about 1.7× the output** for the same page. Part of that buys verification: contracts, schemas and
typed events. The rest is syntax: `ui.div({ class }, [ … ])` is longer than HTML.

Learning cost: Nuxt is in every model's training data. Tenon is not, so each session must read CLAUDE.md
(7.5 KB) plus examples. This trial does not measure that. A fresh-context A/B trial is the only honest test.

## Verdict
- **Maintenance and verification**:
  - Tenon is clearly better on what matters most for a human-facing site that AI keeps changing: behaviour drift
    (M11), styling that silently does nothing (M3), layout shift (M4), XSS (M5), widget contracts (M8).
  - Every catch is located at `file:line` with a fix.
- **Not yet proven**:
  - (a) Literal typos slip through (M1, M2, M12). This contradicts the north star and must be fixed first.
  - (b) Authoring costs more output tokens than Nuxt.
  - (c) Zero-shot learnability by an agent that did not design Tenon is unmeasured.

## Proposed before Phase 6
1. **Close the literal holes**:
   - `op.eq`/`neq` with `NoInfer` on the right side
   - typed `ui.send` payloads
   - typed enumerated attributes
   - a validator rule that checks every literal against its JSON Schema (`enum`, `const`, type), so hand-edited IR
     is caught too
   - internal `href` strings starting with `/` must use `ui.link`

   Re-run this injection until Tenon catches ≥ 11 / 12.
2. **Fresh-agent A/B trial**: agents with no Tenon context build the same small app and then apply the same
   change request, once in Tenon and once in Nuxt. Measure tokens read and written, turns, defects left (hidden
   acceptance checks) and the time to a correct change.
   - Decide Phase 6 from that result.
   - This spends model tokens, so it needs approval.
3. Reduce syntax overhead only if (2) shows it matters. Candidates are shorter builders for text-only elements,
   decided by an ADR.
