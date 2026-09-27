# Hozu website

The official site at https://hozu.org is a private Hozu workspace application. Every query is public and static. The How it works overview has a Hozu machine for its interactive teaching lab. Other pages have no client scripts. There are no mutations, sessions, analytics or external font requests.

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

See [the v2 review](REVIEW.md) for route checks, screenshot findings, article counts and the repository gate. Syntax highlighting runs at build time. The six chapters retain native HTML/CSS explanations. The overview now loads the Hozu client for its pipeline and render-plan lab; see [the interactive review](INTERACTIVE-REVIEW.md) for script measurements and browser checks. The conditional clipboard island attempt is documented in [framework gaps](FRAMEWORK-GAPS.md).

The framework packages remain unchanged.

## Interactive browser verification

Serve the export with a static file server on port 4799, then run `node site/verify-browser.ts` from the repository root. The check uses the repository's existing Playwright dependency and a locally installed Chrome. Set `HOZU_BROWSER_EXECUTABLE` to use a different browser executable and `HOZU_SITE_URL` to use a different local origin. Screenshots and request measurements are saved to `.tmp/site-interactive/`. Stop the static server by its PID when finished.
