# Hozu website

The official site at https://hozu.org is a Hozu 0.9 application built from its own component kit. Every query is
public and static. Three islands ship JavaScript (the home page demo and playground, and the How it works lab); a copy
button loads on pages with code. There are no mutations, sessions, analytics or external font requests.

Design: [DESIGN.md](DESIGN.md). Plan: [PLAN.md](PLAN.md). What 0.9 could not express: [FRAMEWORK-GAPS.md](FRAMEWORK-GAPS.md).

## Build and verify

Use Node 22.18 or newer from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter hozu-site check
pnpm --filter hozu-site export
pnpm --filter hozu-site verify
```

Export replaces only `site/dist`, copies the trial images, and fails if any route is skipped. Verify checks:
- in-process responses, content coverage, exported links and assets, the sitemap and Pages metadata;
- that the header version equals `packages/core/package.json`;
- that every home-page claim links to an existing trial, and every catch card's code and name exist in the diagnostic
  registry;
- that the playground's `hozu render` snapshot equals a fresh run;
- that each page carries only its declared islands;
- that reduced motion stops every animation.

## Content sources

- `content/docs/*.md` and `content/how-it-works/*.md`: front matter declares `title`, `description` and `order`.
- `../docs/trials/*.md` and their `.svg` images, loaded directly; `../CHANGELOG.md`, rendered directly.
- `features/content/claims.ts`: every number the home page shows, each with its trial.

## Structure

- `site/`: the `site` kit (`ui.kit({ id: 'site' })`): frame, type, buttons, sections, receipt, catch cards, ticker,
  the 3D joint, reading layout and the copy button. Styles are `tv()` from `site/tv.ts`; `hozu add kit site --sync`
  refreshes its tailwind-merge block from `app.css`.
- `features/content`: pages, queries, the home sections.
- `features/hero`: the "AI change" machine and its view.
- `features/play`: the component playground. Regenerate `render-snapshot.json` after changing `site/button.ts`.
- `features/lab`: the pipeline and render-plan walkthrough and its contracts.

## Deployment

`.github/workflows/pages.yml` builds and uploads `site/dist` on the configured main-branch paths or a manual dispatch,
then deploys with the GitHub Pages environment. The export includes `CNAME`, `.nojekyll`, `404.html`, `sitemap.xml`,
`robots.txt`, a static sharing image and a web manifest.
