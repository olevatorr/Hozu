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
- `content/how-it-works/*.md`: ordered explanations of the design, with native interactive pipeline and render-plan controls.
- `../docs/trials/*.md`: the original trial records, loaded directly with `@hozu/content`. Do not copy them into the site. Relative links to trials resolve to published trial pages; other relative links resolve to GitHub source.
- `../CHANGELOG.md`: the original changelog, rendered directly.
- `features/content/views.ts`: home page; `chrome.ts`, `articles.ts` and `diagrams.ts` hold navigation, reading layouts and native interactive diagrams. Measured claims link to trials 0010–0013. The 72/72 versus 67/72 result comes specifically from trial 0012.
- `assets/`: copies of the repository logo and the sharing icon (`head.image` via `ui.asset`).

## Deployment

`.github/workflows/pages.yml` builds and uploads `site/dist` on the configured main-branch paths or a manual dispatch, then deploys with the GitHub Pages environment. Select GitHub Actions as the repository's Pages source and configure the custom domain `hozu.org` with its DNS records. The workflow does not change repository settings or DNS.

The export includes `CNAME`, `.nojekyll`, `404.html`, `sitemap.xml`, `robots.txt`, a static sharing image and a web manifest.

## Verification record

See [the v2 review](REVIEW.md) for route checks, screenshot findings, article counts and the repository gate. Syntax highlighting runs at build time. All exported pages ship 0 client JavaScript bytes, including the native interactive explanations. The conditional clipboard island attempt is documented in [framework gaps](FRAMEWORK-GAPS.md).

The framework packages remain unchanged.
