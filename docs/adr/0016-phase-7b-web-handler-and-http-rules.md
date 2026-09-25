# ADR 0016 — Phase 7b: a web-standard handler, HTTP rules as data, and an edge build

- Status: accepted. Rewrites stay out, and Deno/workerd are not installed (user decision).
- Scope: Tier 2 items 7 and 12 of ADR 0011. It covers three things:
  - `(Request) => Response` as the only server entry point;
  - redirects, response headers, `trailingSlash` and `basePath` declared as project data;
  - a build output that lets the runtime start without a file system, which is what edge runtimes need.

## Where the code is tied to Node today
| Place | Node dependency | Needed at request time? |
|---|---|---|
| `adapter-node/handler.ts` (routing, ISR cache, effects, forms, live, errors: ~390 lines) | `IncomingMessage` / `ServerResponse`, `Buffer`, `readFileSync` for assets | yes |
| `adapter-node/session.ts` | `node:crypto` HMAC | yes |
| `runtime-server/render.ts` | `node:crypto` for the speculation-rules CSP hashes | once |
| `runtime-server/assets.ts` | reads the client bundle from disk via `import.meta.resolve` | once |
| `core` builders (`ui.asset`, widgets, source capture) and `core/canonical/hash.ts` | `node:fs`, `node:url`, `node:crypto`, imported at module load | only while building the IR |
| Tailwind (`@tenon/css`), esbuild (`@tenon/bundle`) | third-party, Node | no, but today they run when the server starts |

Almost all request logic is plain JavaScript. The real obstacle for edge runtimes is the last two rows. Importing
`tenon.config.ts` runs `ui.asset()`, which reads files, and the `@tenon/core/ir` entry imports `node:fs`
statically.

## 1. The handler
| Option | Trade-off |
|---|---|
| a. Keep the Node handler and add a separate fetch handler | Two copies of routing, caching, forms and security that must stay equal |
| b. Node handler as the core, with a `Request` shim for other platforms | Node types leak into every platform; streaming through a shim costs a copy |
| **c. One `(Request) => Promise<Response>` handler; Node gets a thin bridge** | Node pays one conversion per request. The API changes: `session` receives a `Request` |

**Decision (c).**
- `createHandler(options)` moves from `@tenon/adapter-node` to `@tenon/runtime-server`. It returns
  `{ fetch(request): Promise<Response>, revalidate(tags): number }`.
- Pages stream through a `ReadableStream`, and live queries are a streamed SSE `Response`.
- The handler's own code uses only web APIs: `Request`, `Response`, `Headers`, `URL`, `ReadableStream`,
  `crypto.subtle`, `TextEncoder`. The API changes that follow:
  - `session: (request: Request) => unknown | Promise<unknown>`;
  - `sessionCookie` is rewritten on WebCrypto (HMAC-SHA-256) and moves to `@tenon/runtime-server`. Its `read` is
    async, and `write` returns a `Set-Cookie` value;
  - CSP hashes use `crypto.subtle.digest`, computed once on the first request.
- `@tenon/adapter-node` keeps `createServer(options)`, which bridges `IncomingMessage` → `Request` and streams
  `Response` → `ServerResponse`. It also serves the static files (section 3).
- There are no per-platform packages. Bun, Deno, Cloudflare Workers and Vercel all accept
  `export default { fetch: handler.fetch }`. The skill documents that one line.
- **State that lives in the process**: the ISR page cache, tag revalidation and live listeners.
  - They move behind a `cache` option (`get` / `set` / `deleteTags`). The default is in-memory, as today.
  - On serverless and edge, each instance has its own cache, and `revalidate` only reaches that instance. This is
    documented.
  - A shared cache (KV, Redis) is a platform adapter that uses an external service, so it is not in this phase and
    needs approval first.

## 2. HTTP rules as data
A new required project field `http: null | { basePath, trailingSlash, redirects, headers }`. `null` behaves as
today, except that the non-canonical trailing-slash form now redirects (see below).

### trailingSlash
| Option | Trade-off |
|---|---|
| a. Accept both forms, as today (`/about` and `/about/` both render) | Two URLs for one page; only `<link rel=canonical>` hides it |
| **b. `trailingSlash: 'never' \| 'always'`, and the other form answers 308** | One canonical URL per page (principle 1). The choice is per project, because static hosts differ |

**Decision (b).** `http: null` means `'never'`. The route table (`routeTable`) applies the form. That table is
already the single source of every generated URL: `ui.link`, `navigate`, the sitemap, the canonical link, the
soft-navigation matcher and the static export paths. So the client needs no new code.

### basePath
For an app served under a prefix such as `/shop`.
- `basePath: '' | '/segment[/segment…]'`. An invalid value is reported by **TN039** (invalid-base-path).
- At build time the prefix is applied to the route table and to every asset `href` in the IR. The handler strips
  it before matching, and `/_tenon/*` moves to `${basePath}/_tenon/*`.
- The client's endpoints (`/_tenon/effect`, `/query`, `/live`) are resolved against the client script's own URL
  (`new URL('effect', import.meta.url)`), so the payload does not grow.
- Requests outside the prefix answer 404.

### redirects
```ts
redirects: [
  { from: '/blog/:slug', to: (p) => ui.link(post, { slug: p.slug }), permanent: true },
  { from: '/docs', to: 'https://docs.example.com', permanent: false },
]
```
- `from` is a path pattern with `:name` segments, typed from the string literal.
- `to` is either a `ui.link(...)` recorded against the `from` params, or an absolute external URL. An internal
  string path is TN032, as for `href`.
- `permanent` chooses 308 or 307. Query strings are carried over.
- A `from` that matches a declared route, or another redirect, is **TN037** (redirect-conflict). A redirect never
  hides a page, and a URL has one owner.
- Params that fail the target route's schema answer 404.

### headers
```ts
headers: [
  { routes: 'all', set: { 'permissions-policy': 'camera=(), microphone=()' } },
  { routes: [post], set: { 'x-robots-tag': 'noarchive' } },
]
```
- Headers apply to page responses. `routes` holds route declarations (identities, not patterns) or `'all'`. Later
  entries override earlier ones per header name.
- Header names are lowercase tokens.
- Framework-owned headers are **TN038** (reserved-header):
  - `content-type`, `content-length`, `cache-control` (derived, principle 8), `vary`, `location`;
  - `set-cookie` (sessions), `content-security-policy` (the `csp` option), `x-tenon-cache`.

  An invalid header name is also TN038.

### Rewrites are not added
ADR 0011 listed rewrites, but both kinds conflict with the principles:
- **Internal rewrites** serve one page at two URLs, which breaks principle 1.
- **Proxy rewrites** to another origin make Tenon a reverse proxy for services it does not declare.

The equivalent Tenon forms are a redirect, another `route()`, or a proxy in front of the app. **Decision (user):**
rewrites stay out.

## 3. Running without a file system (edge)
| Option | Trade-off |
|---|---|
| a. Only runtimes that have `node:fs` (Node, Bun, Deno, serverless functions) | Small change, but Cloudflare Workers and Vercel Edge stay out |
| b. Bundle the whole project, and let a plugin replace file reads | Hidden build magic that is hard to verify |
| **c. `tenon build` writes an explicit output, and the runtime builds the IR from it without reading files** | One new CLI command and a manifest; everything that needs Node happens there |

**Decision (c).**
- **`tenon build [--out dist]`** runs in Node and writes:
  - `dist/public/<basePath>/_tenon/…`: the client bundle, `fns.js`, the compiled stylesheet and preloaded fonts,
    the widget bundles and the content-hashed assets. These are immutable static files that any host or CDN can
    serve.
  - `dist/manifest.json`: asset hrefs and dimensions keyed by the source URL relative to the project, the
    stylesheet href and preloads, the widget URLs, the CSP script hashes, and the IR hash so a mismatch is caught.
- **`buildProject(project, { manifest })`** reads nothing from disk. `ui.asset(url)` only records the URL, and the
  build resolves it through the manifest, or through the file system in Node when there is no manifest. The file
  system is reached with `process.getBuiltinModule` inside the functions that need it, so no module in the runtime
  import graph imports `node:*`.
- **An edge entry**:
  ```ts
  import manifest from './dist/manifest.json' with { type: 'json' }
  const handler = createHandler({ build: buildProject(project, { manifest }), manifest, resolvers: createResolvers() })
  export default { fetch: handler.fetch }
  ```
  - Static files are served by the platform.
  - `createServer` (Node) serves `dist/public` itself when given the manifest.
  - Without a manifest, `createServer` builds at startup as today. That is how `@tenon/dev` keeps working.
- **One form per lifecycle**: development builds at startup, and a deployment runs `tenon build`. Both produce the
  same IR, and a test checks that.

## Diagnostics
| Code | Name | Severity |
|---|---|---|
| TN037 | redirect-conflict | error |
| TN038 | reserved-header | error |
| TN039 | invalid-base-path | error |

Each gets a registry entry, a rule, a fix and a mistake-catalog case.

## Verification (no paid or external services)
- **The existing adapter-node tests** run unchanged through the bridge. This covers ISR, forms, CSRF, CSP,
  uploads, live, error pages and 404s.
- **A handler test with plain `Request` objects**: redirects (308/307, query carried over), headers, trailing-slash
  canonicalisation, and basePath for pages, links, assets and client endpoints.
- **An edge check**:
  - bundle `examples/cart/edge.ts` with esbuild, `platform: 'neutral'`. It must contain no `node:` import;
  - run the bundle in a `node:vm` context that exposes only web globals;
  - render home, post an effect and check the session cookie round trip.
- **Bun**: already installed locally, so `bun examples/cart/edge-bun.ts` serves the same entry through `Bun.serve`,
  checked with a few HTTP requests. Deno and workerd are not installed; installing them needs your approval.
- **Bench**: a new report-only metric, P9 (requests per second for `/` on the cart through adapter-node), measured
  before and after. A drop of more than 20% from the bridge is raised, not accepted silently.

## Consequences
- **Breaking changes**, each migrated in examples, tests and the skill:
  - `session` receives a `Request`: `request.headers.get('cookie')`;
  - `sessionCookie` moves to `@tenon/runtime-server`;
  - `createHandler` returns an object with `fetch`;
  - `project({ http })` is required (`http: null` in every example).
- `/about/` now redirects to `/about`. It used to render the same page.
- Change cost (trial 0005) grows only by the one `http: null` line per project. The redirect and header syntax
  reuses `ui.link` and route identities.
- Client JS: resolving endpoints from `import.meta.url` costs a few bytes. P7 has 39 B of headroom. Every optional
  part of the client (live, uploads, motion, widgets, navigation) is already a lazy chunk. The initial JS is only
  hydration, the DOM runtime and the machine, so there is nothing cheap left to split. If P7 overflows, I bring
  you the measured number and ask before changing the budget.

## Implementation order
1. The web handler and the Node bridge, with the existing tests green.
2. The HTTP rules, with TN037–TN039.
3. `tenon build`, the fs-free build, the edge check and Bun.

Each step ends green. The gate runs once, at the end of the phase.
