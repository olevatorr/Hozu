# ADR 0039 — Ordinary TypeScript in builder callbacks (R3 of ADR 0038)

- Status: accepted (the owner chose R1 + R2 + R3 for 0.5)
- Motivation: ADR 0038 found documentation to be the largest part of an agent's extra cost (45–75 % of the gap to
  Nuxt).
  - Most of that documentation teaches rules that differ from ordinary TypeScript:
    - references are recorded;
    - `===` becomes `op.eq`;
    - `?:` becomes `ui.if`;
    - a template string becomes a `fn`;
    - an update becomes `op.set`.
  - Those rules are also why Hozu reads as counter-intuitive and verbose.

## Decision
**Authors write ordinary TypeScript** inside builder callbacks (view `render`, machine `states`, `guard`, `assign`,
`navigate`, `ui.each` / `ui.query` callbacks, page `head` / `entries`, query `tags`, mutation `invalidates`). A
source transform lowers it to the IR that the explicit forms produce today. The IR, validator, compiler and runtimes
are unchanged, except that four builtin functions are added.

### What is lowered
The rewrite applies only when an operand is a **reference**. A reference is a parameter of a builder callback, a path
on one, or a local `const` bound to one.

| Written | Lowered to |
|---|---|
| `a === b`, `!==`, `<`, `<=`, `>`, `>=` | `op.eq` / `neq` / `lt` / `lte` / `gt` / `gte` |
| `a && b`, `a \|\| b`, `!a` in a condition | `op.and` / `op.or` / `op.not` |
| a reference alone as a condition | the builtin `#truthy` (JavaScript truthiness) |
| `c ? A : B` where `A` or `B` is a node (`ui.…`, `when`, `null`) | `ui.if(c, [A], [B])` |
| `c && A` where `A` is a node | `ui.if(c, [A], [])` |
| `c ? a : b` as a value | `#cond` |
| `a ?? b` as a value | `#coalesce` |
| `` `…${a}…` `` | `#concat` |
| `a.length` | `#length` |
| `a + b`, `a - b` | `#plus` / `#minus` |
| `ctx.x = v` in an `assign` body | `op.set` |
| `ctx.n += v`, `-= v` | `op.inc` |
| `ctx.list.push(v)` | `op.append` |
| `ctx.list = ctx.list.filter((i) => i.key !== v)` | `op.removeWhere` |

**What is not lowered:**
- A method call on a reference (`.map`, `.toUpperCase()`…) is HZ014 at build time, with the fix: `ui.each` for lists,
  `fn()` for computations. `fn()` stays the way to compute: principle 4 is unchanged.
- The explicit forms (`op.*`, `ui.if`) keep working and remain what the transform produces. The guide teaches the
  ordinary form.
  - This is an owner-approved exception to principle 1: two spellings, one IR.
  - `ui.if` stays for motion (`ui.if(c, a, b, 'fade')`).

### Where it runs
- The `@hozu/transform` package, depending on `acorn` (an exception to the zero-dependency rule, like `@hozu/css`)
  and on Node's `stripTypeScriptTypes`. Types are replaced by spaces, so every position is kept.
  - The transform edits only within a line's existing text, and keeps every newline, so stack-captured
    `file:line` locations stay exact.
- Where it applies:
  - **Node:** `node --import @hozu/transform/register serve.ts`, written into the scaffold's scripts. The CLI and
    `@hozu/dev` register it themselves.
  - **Vitest / Vite:** `hozuTransform()` from `@hozu/transform/vite`.
  - **esbuild** (edge bundles): `hozuTransform()` from `@hozu/transform/esbuild`.
- **Safety net:** a transformed module registers its URL. `buildProject` reports HZ047 when a view or machine comes
  from a file that was not transformed, because that code would silently compare placeholders. Builds from a
  manifest (edge) skip the check.

### Types
`Ref<T>` also carries `T` for primitives (`string & Expr<string>`), so `===`, `?:` and template strings type-check.
Method calls also type-check, and the transform rejects them with HZ014.

## Principle check
- **Principle 2:** the transform is deterministic and visible. `hozu explain` and `hozu inspect` show the IR it
  produced, and the scripts name the hook.
- **Principle 4:** logic is still data. The transform produces the same `op.*` IR, and anything beyond operators
  still needs a named, schema-typed `fn()`.
- **Principle 1:** see the exception above.

## Verification
- Unit tests for every row of the table and every rejection.
- Every example rewritten in the ordinary form produces an IR identical to today's, apart from the new builtins.
  This is checked by a test on its IR hash.
- HZ047 when the hook is missing.
- Locations point at the authored line.
- Gate green, A4 (type instantiations) within budget.
- Trial: R1–R3 together (ADR 0038 targets).

## Result
- **Implemented as decided**, with two changes:
  - HZ044 is the untransformed-source error; the code was never released with its earlier meaning;
  - the safety net marks the declarations rather than the files, because file paths from stack traces are unreliable
    under happy-dom.
- **Bookmarks, the scaffold, the recipes, the README and the site** use the ordinary form.
  - Bookmarks' machine behaviour is unchanged: the lock checks.
  - The view IR differs where a condition became a ternary: `b.read ? …` is truthiness, where it was `op.eq(b.read,
    true)`.
- **Costs of the transform:**
  - `hozu validate --json` cold start went from 130 to about 185 ms, which includes loading the parser (budget P3:
    300 ms);
  - type instantiations for the cart fell from 61.7 k to 55.0 k.
- **Trial 0016:** see ADR 0038, "Result".
