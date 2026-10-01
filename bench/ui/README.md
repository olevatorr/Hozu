# ADR 0045 phase 0 baseline

```sh
pnpm build
node --import ./packages/transform/dist/register.js bench/ui/baseline.ts
pnpm exec biome format --write bench/ui
```

The script writes `baseline-0.8/` from every `examples/*` project and `site`. With `--out <dir>` it writes there
instead, and `node bench/ui/compare.ts <dir>` compares that IR with `baseline-0.8/` after removing phase 1's
`irVersion: 3` and empty `kits` / `components` (ADR 0045, contract layer). The base is `80d55fe`, the accepted ADR
0045 on the 0.8 integration branch.

| File | Content | Used by |
|---|---|---|
| `<project>.ir.json` | IR v2, canonical key order | `normalize08` equivalence after `hozu migrate 0.9` (acceptance 3) |
| `summary.json` | P7 (min+gz bytes of `client.js` and its static chunks); per project, the build diagnostics and per route `js` (`always` / `conditional` / `false`), the island count and the widgets | acceptance 1 (no new client JS) and 2 (P7) |
| `conflicts.json` | Every pair of classes on one element that set the same properties with different values, under the same variant | HZ079 scope (ADR 0045 F, gate G1) |

## How a conflict is found
- Each class is compiled alone with the project's own stylesheet and the production resolver (`@tailwindcss/node`
  `compile`, as `compileStyles` does).
- Only the `@layer utilities` block is read.
- A pair conflicts when:
  - both classes have the same variant prefix and the same `!`;
  - they set the same set of non-custom properties;
  - at least one value differs.
- Pairs inside one toggle key are compared; a key is not compared with itself.

## Results at `80d55fe`
- **P7:** 7 893 B.
- **Same-property pairs:** 30.

| Project | Kind | Pairs | Verdict |
|---|---|---|---|
| examples-showcase | class against toggle | 6 | real. On 3 tab nodes, `text-slate-600` / `text-slate-900` and `dark:text-slate-300` / `dark:text-white`. The toggle wins only because of name order. |
| examples-trial-0006 | toggle against toggle | 14 | exclusive guards (`===` / `!==`, or one reference against different literals) |
| examples-trial-tasks | toggle against toggle | 8 | exclusive guards |
| examples-trial-0007 | toggle against toggle | 2 | exclusive guards |

- No pair is two static classes.
- No pair in the other seven projects.
