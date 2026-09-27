# ADR 0031 — Official Hozu website

- Status: accepted for implementation by the website request
- Scope: one phase, the static official website at https://hozu.org

## Options and trade-offs

1. An external documentation framework offers ready-made navigation but does not exercise Hozu.
2. Handwritten HTML avoids framework limitations but duplicates its rendering and metadata pipeline.
3. A Hozu workspace app follows the blog example and exports static HTML. This tests the public authoring surface and needs explicit routes and content queries.

## Decision

Use option 3. The private `hozu-site` package lives in `site/`, as explicitly requested, rather than duplicating it under `examples/`. Existing examples remain runnable. Do not change framework packages. Record unsupported needs, attempted APIs and diagnostics in `site/FRAMEWORK-GAPS.md` and use the simplest supported design.

Use public, static queries with no machines. Human documentation lives in ordered Markdown files; trials and changelog are read from their repository sources. Parameterized pages declare entries. All view links use route identities. Repository-relative Markdown links resolve to the corresponding published trial or repository source.

The visual system uses white (#ffffff), mist (#eef4fa), ink (#172b43), blue (#245ca6) and muted slate (#536579). System sans-serif text and monospace code avoid font requests. A large left-aligned pitch and the existing joint logo introduce the framework; readable article columns and a compact sidebar support longer reading. No decorative animation or client-only controls.

## Implementation plan

1. Create workspace/configuration, typed routes, public content queries, resolvers and shared navigation.
2. Write human docs; render original trials/changelog; add the home, trial index and 404 views.
3. Export to `site/dist`, require zero skipped routes and write Pages metadata. Add the explicitly requested Pages workflow.
4. Run Hozu checks and in-process requests, audit exported links/assets/metadata, then run the repository gate once. Record any unstable benchmark rather than rerunning it.
5. Commit on `site` with English messages; do not push.

## Verification

Require clean type checking and validation, expected page statuses/text, complete static export, canonical hozu.org sitemap URLs, CNAME, .nojekyll and 404.html. Include site TypeScript in the root gate. No development server is started.
