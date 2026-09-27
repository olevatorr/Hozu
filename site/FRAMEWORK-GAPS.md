# Framework gaps

## Local assets in head.image

- Needed: use the copied local icon as a static social image through the asset pipeline.
- Tried: `head.render: () => ({ image: ui.asset(new URL('./assets/icon-256.png', import.meta.url)) })`.
- Diagnostic: `TS2322: Type 'Asset' is not assignable to type 'Val<string | null>'`. Hozu validation itself reported no errors or warnings.
- Supported design: use the absolute URL `https://hozu.org/icon-256.png` for `head.image` and copy that file into the export directory. The site icon still uses `ui.asset`. No `ui.og` or server is needed.

## Static export omits the linked web manifest

- Needed: every local URL linked by exported HTML must exist on GitHub Pages.
- Tried: export with `site.icon` and `site.themeColor`, then without both optional fields. Both outputs link `/manifest.webmanifest`; neither export writes that file.
- Diagnostic: the export reports zero skipped routes, but the link audit fails with `ENOENT: no such file or directory, stat 'site/dist/manifest.webmanifest'`. Hozu validation reports no warning for it.
- Supported design: the site's export script writes a static web manifest alongside its copied icon. It declares browser display, with no offline service worker or server requirement.

No framework packages are modified.
