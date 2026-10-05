# ADR 0061 — Releases from GitHub Actions

- **Status:** accepted (owner, 2026-10-05: "可以寫github action來發佈吧? … 可以啊 … 之前是因為還沒公開發佈，所以那則你可以硬生生拿掉即可").
- **Supersedes:** the publishing part of ADR 0025 (manual `npm publish` with the owner's 2FA code, no CI). That rule
  held while nothing was public; the repository and the packages are public now.
- **Why now:** 0.18.1 went out with `create-hozu` live while eleven of its dependencies were not: a hand-run loop
  outlived its one-time code, and the working tree changed under a publish that packed from it. Every new
  `npm create hozu` failed to install until they were published again.

## Decision
- **`.github/workflows/release.yml`**, two jobs:
  - `check` on every `v*` tag and on a manual run: install, build, lint, typecheck, the tests with Chrome, pack, and
    `scripts/publish.ts --dry-run`. No approval; publishes nothing.
  - `publish` on a `v*` tag only, after `check`, in the GitHub environment `npm`, which waits for the owner's
    approval. It packs again and runs `scripts/publish.ts`.
- **No token:** npm Trusted Publishing (OIDC, npm ≥ 11.5.1, `id-token: write`). The `publish` job runs Node 24,
  whose npm qualifies: upgrading Node 22's npm in place (`npm install -g npm@11`) broke halfway on the runner
  (`Cannot find module 'promise-retry'`) the first time it ran, before anything was published. Each package on npmjs.com trusts this
  repository, this workflow file and the `npm` environment; every version carries provenance.
- **`scripts/publish.ts`** refuses unless `.tmp/release` holds the 21 packages at one version equal to the tag;
  publishes the 20 `@hozu/*` not yet on npm, waits until npm shows all of them, then `create-hozu`; then creates an
  app with `npx create-hozu@<version>`, installs it and runs `hozu check`. A rerun skips what is already published.
- **Not in CI:** the timing budgets of `pnpm bench` (shared runners vary); `pnpm gate` still runs locally before a
  tag, as ADR 0001 asks.
- **Actions are pinned to commit hashes**; the workflow has `contents: read` and asks for `id-token` only where it
  publishes.

## Release flow
1. Gate, review, merge to `main`, `git tag vX.Y.Z`, push the tag.
2. The owner approves the `publish` job in GitHub (Actions → the run → Review deployments).
3. The job publishes and checks a fresh install; afterwards, check the site.
