# 0.7 baseline (ADR 0043 wave 0)

The IR and v1 lock of every 0.7 app, so the 0.8 waves can compare against 0.7 (`normalize07`, `hozu migrate 0.8`).

- Produced by `node bench/trial/longrun/baseline-0.7/snapshot.mjs` (Node 22.22.1, after `pnpm build`); commit and
  per-snapshot results are in `manifest.json`. A second run gives byte-identical files.
- Package versions:
  - repository apps (`examples/*`, `site`, the reference): the workspace packages, 0.7.0. `packages/*/src` is identical
    to the `v0.7.0` tag;
  - the trial fixtures: the published 0.7.0 tarballs in each app's own `node_modules` (all 13 `@hozu/*` at 0.7.0).
- Snapshots:
  - `examples-<app>`, `site`;
  - `reference-hozu-base` (steps 0 and 1), then `reference-hozu-sNN` after replaying `hozu-steps/02.patch … NN.patch`;
  - `trial0020-hozu-run1-s12`, `trial0020-hozu-run2-s12`: tag `s12` of `~/hozu-trial-0020/<run>/app`, extracted with
    `git archive` into a temp dir whose `node_modules` links to the app's.
- `<name>.ir.json`: the canonical `ProjectIR` from `buildProject(project, { sources: false })`, loaded with the app's own
  CLI and transform, as `hozu inspect` does.
- `<name>.lock.json`:
  - `committed`: the app's `hozu.lock.json` (`null` when there is none);
  - `computed`: the lock written by that CLI's `hozu validate --update-lock` on a temp copy without the committed lock;
  - `stale`: per feature, entries that were already out of date under 0.7 (`missing`, `removed`, `behavior`,
    `contracts`). At the time of writing: `reference-hozu-s03` (4 contract hashes) and `trial0020-hozu-run2-s12`
    (4 missing `Undo` transitions, 2 behaviour and 4 contract hashes).
