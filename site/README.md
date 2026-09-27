# Hozu website

The official site at https://hozu.org is a private Hozu workspace application. Every query is public and static. There are no machines, mutations, sessions, analytics or external font requests.

## Build and verify

Use Node 22.18 or newer from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter hozu-site check
pnpm --filter hozu-site export
pnpm --filter hozu-site verify
```

The first build compiles workspace packages on a fresh checkout. Export replaces only `site/dist`, reports every skipped route and fails if any route is skipped. Verification checks in-process responses, content coverage, exported links and assets, sitemap origins and Pages metadata. No development server is required.

## Content sources

- `content/docs/*.md`: human documentation. Front matter declares `title`, `description` and `order`; order controls the sidebar and previous/next navigation.
- `../docs/trials/*.md`: the original trial records, loaded directly with `@hozu/content`. Do not copy them into the site. Relative links to trials resolve to published trial pages; other relative links resolve to GitHub source.
- `../CHANGELOG.md`: the original changelog, rendered directly.
- `features/content/views.ts`: home page and shared navigation. Measured claims link to trials 0010–0013. The 72/72 versus 67/72 result comes specifically from trial 0012.
- `assets/`: copies of the repository logo and the sharing icon (`head.image` via `ui.asset`).

## Deployment

`.github/workflows/pages.yml` builds and uploads `site/dist` on the configured main-branch paths or a manual dispatch, then deploys with the GitHub Pages environment. Select GitHub Actions as the repository's Pages source and configure the custom domain `hozu.org` with its DNS records. The workflow does not change repository settings or DNS.

The export includes `CNAME`, `.nojekyll`, `404.html`, `sitemap.xml`, `robots.txt`, a static sharing image and a web manifest.

## Verification record

Verified with Node 22.22.2:

- `hozu check`: types OK, 0 errors, 0 warnings, 0/0 contracts, lock checked.
- Required `hozu get` paths: `/`, `/docs/getting-started`, `/trials/0012-correctness-notes` return 200; `/does-not-exist` returns 404 with the expected text.
- Additional checks cover the changelog and missing documentation/trial slugs.
- Static export: 0 skipped routes, 27 HTML files, 25 canonical sitemap URLs; every local link and asset resolves.
- Desktop and mobile Chromium inspection: images load, no horizontal page overflow. Exported files are intercepted directly; no development server runs.
- Repository gate: lint, type checking, 261 passing tests (4 skipped) and all benchmark budgets pass. Benchmarks run once.

The framework packages remain unchanged.
