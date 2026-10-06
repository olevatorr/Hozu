# ADR 0066 — 0.20.2: fingerprints a bundler cannot change

- **Status:** accepted (owner, 2026-10-06: "用A，做成0.20.2").
- **Source:** GitHub issue #1 (an outside user): an app bundled with `hozuTransform()` and served with
  `createHandler(app, { manifest, render })` failed "The build manifest does not match this project" as soon as it
  declared a `ui.component`, because the IR hashed `String(render)` (and `String(impl)` for `fn`), and a bundler
  reprints function text.

## Options
- **A:** `hozu build` writes each component's and `fn`'s fingerprint into the manifest; a build given a manifest reads
  them, as it already reads client and fetch module hashes.
- **B:** compute the fingerprint at transform time from the original source; it would change every `fn` hash, so
  every app with a `fn` would see its lock go stale on upgrade.

## Decision
A. `Manifest.sources = { components: { id: hash }, fns: { ref: hash } }`. `hozu check` and `hozu build` hash as before,
so locks do not change. A build with a manifest no longer notices a `fn` or render text edited without running
`hozu build` again through the IR hash; view structure still changes the hash. Fingerprinting the lowered render
(the issue's point 3) stays open.

`@hozu/bundle` loads `node:path` and `esbuild` only when it builds, through a computed specifier, so an edge bundle of
an `app.ts` that names `bundleComponents` pulls in no Node built-ins.
