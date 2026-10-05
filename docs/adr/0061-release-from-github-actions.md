# ADR 0061 — Releases from GitHub Actions

- **Status:** accepted (owner, 2026-10-05: "可以寫github action來發佈吧? … 可以啊 … 之前是因為還沒公開發佈，所以那則你可以硬生生拿掉即可").
- **Supersedes:** the publishing part of ADR 0025 (manual `npm publish` with the owner's 2FA code, no CI). That rule
  held while nothing was public; the repository and the packages are public now.
- **Why now:** 0.18.1 went out with `create-hozu` live while eleven of its dependencies were not: a hand-run loop
  outlived its one-time code, and the working tree changed under a publish that packed from it. Every new
  `npm create hozu` failed to install until they were published again.

## Decision
- **`.github/workflows/release.yml`**: a `v*` tag runs `publish` in the GitHub environment `npm`, which waits for the
  owner's approval; it packs and runs `scripts/publish.ts`. A manual run (`workflow_dispatch`) runs `check` instead:
  build, lint, typecheck, tests, pack and a dry run, publishing nothing.
- **No token:** npm Trusted Publishing (OIDC, npm ≥ 11.5.1, `id-token: write`). The `publish` job runs Node 24,
  whose npm qualifies (upgrading Node 22's npm in place broke on the runner). Every version carries provenance.
- **`scripts/publish.ts`** refuses unless `.tmp/release` holds the 21 packages at one version equal to the tag, then
  publishes the 20 `@hozu/*` not yet on npm and `create-hozu` last. A rerun skips what is already published.
- **The checks stay with the assistant, as before** (owner, 2026-10-06: "過去的檢查我都會交給你，請務必一樣，我不需要
  這些機制"): the gate and review before the tag, and after the publish, that every package is on npm and a fresh
  `npx create-hozu` installs and checks. The first version of the workflow also tested on the runner and waited
  until npm showed every package before `create-hozu` and a smoke install; that took minutes of waiting and was
  removed.
- **Actions are pinned to commit hashes**; the workflow has `contents: read` and asks for `id-token` only where it
  publishes.

## Release flow
1. Gate, review, merge to `main`, `git tag vX.Y.Z`, push the tag.
2. The owner approves the `publish` job in GitHub (Actions → the run → Review deployments).
3. The assistant checks npm (all 21 at the version), a fresh `npx create-hozu@latest` install and the site.
