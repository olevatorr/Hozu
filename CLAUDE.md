# Tenon — AI-first frontend framework

## North star
Make invalid AI-generated programs structurally difficult to express,
and make valid programs cheap to verify.

Pipeline: `feature() source → Feature IR → validator → compiler → runtime`.
The IR is the source of truth. TS source is a typed authoring surface over it.

## Non-negotiable principles
1. One canonical form per concept. No syntax sugar, no aliases. Formatter normalizes.
2. Explicit over implicit. No auto-imports, no global injection, no file-based magic.
3. No stringly-typed cross references where a declaration identity is possible.
4. Closed world: views are constrained `ui()` trees, never arbitrary functions.
   Side effects only via declared `query` / `mutation`.
5. Every behavior change requires a contract change.
6. Feature boundaries are enforced: features import only other features' public contracts.
7. Diagnostics are structured JSON with location, cause, and suggested fix.
8. Rendering mode is DERIVED, never chosen:
   - query declares `scope: 'public' | 'user'` and
     `freshness: 'static' | { revalidate } | { swr } | 'live'`
   - compiler derives a per-node render plan (static / ISR / SWR / streamed SSR / client)
   - `scope: 'user'` data must never reach a cacheable region (hard error)
   - only nodes bound to a machine hydrate; everything else ships 0 JS
   - `render: 'static'` style assertions are allowed but validated, never obeyed blindly
9. Framework-owned fetch: queries have tags, mutations declare `invalidates`.
   Server-fetched data is serialized into the payload and never refetched on the client.

## Explicitly out of scope
- Pure SPA mode as a separate concept (it is the all-user-scoped case)
- Arbitrary effects inside views
- Manual route-level cache config
- Global mutable client stores (cross-feature state goes through exports contracts)

## Tech
- TypeScript strict, pnpm workspaces, Vitest
- Schemas: Standard Schema compatible (support Valibot/Zod via adapter)
- Packages are published under the @tenon/ scope:
  `@tenon/core` (IR types + builders), `@tenon/validator`, `@tenon/compiler`,
  `@tenon/runtime-server`, `@tenon/runtime-client`, `@tenon/cli`,
  `@tenon/adapter-node`, `@tenon/adapter-static`
- Minimal comments. Small modules organized by functionality.

## CLI (agent-facing, all support --json)
`tenon inspect <feature>` · `tenon validate [feature]` · `tenon impact <feature>.<symbol>`
`tenon graph <feature>` · `tenon plan <route>` · `tenon explain <feature>.<state>`

## Workflow rules
- Work phase by phase. Do not start the next phase without my approval.
- Before each phase, write `docs/adr/NNNN-*.md` with options, trade-offs, and your decision.
- Every phase ends with passing tests and a runnable example in `examples/`.
- If a principle blocks a practical need, stop and raise it. Do not quietly bend it.
