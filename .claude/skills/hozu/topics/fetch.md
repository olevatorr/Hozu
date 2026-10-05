# Where effects run: runs and fetch.ts

Every query and mutation declares `runs` (required, no default): what its implementation needs.

| `runs` | The implementation needs | Implemented in |
|---|---|---|
| `'server'` | a database, a server secret, the session | `app.ts` / `features/<name>/server.ts` resolvers |
| `'browser'` | the visitor's own data in the browser (a list in `localStorage`), or browser credentials (a token, an OIDC library, the API's own cookies) | `features/<name>/fetch.ts` |
| `'either'` | nothing special: a public API, or your own API with CORS | `features/<name>/fetch.ts` |

```ts
// fetch.ts: one export per effect, under its name; the model import is type-only
import { implement } from '@hozu/core/fetch'
import type * as model from './model.ts'
export const searchRepos = implement<typeof model.searchRepos>(async ({ q }, { fail, signal, env }) => {
  const r = await fetch(`${env.API_URL}/search/repositories?q=${encodeURIComponent(q)}`, { signal })
  return r.ok ? (await r.json()).items : fail('Unavailable', {})
})
export const myRepos = implement<typeof model.myRepos>(async (_, { fail, signal }) => {
  const token = localStorage.getItem('gh-token')
  if (!token) return fail('Unauthorized', {})
  const r = await fetch('https://api.github.com/user/repos', { headers: { authorization: `Bearer ${token}` }, signal })
  return r.status === 401 ? fail('Unauthorized', {}) : r.json()
})
```
- The feature names the module: `feature({ …, fetch: new URL('./fetch.ts', import.meta.url) })`; `app()` needs
  `components: bundleComponents` (HZ045). A missing or extra export is HZ081.
- Browser-held data (`localStorage`, a token, the API's own cookies) is `scope: 'user'`; `'either'` needs
  `scope: 'public'` (HZ081).
- fetch.ts runs in the browser: no Node-only imports, no secrets; `env` is the public env only.
- Every other origin fetch.ts calls goes in `feature({ connect: ['https://api.github.com', { env: 'API_URL' }] })`
  (HZ083); the API must allow the page's origin (CORS), otherwise use `runs: 'server'`.

<!-- more -->

## The model side
```ts
// model.ts
export const searchRepos = query({ input: z.object({ q: z.string() }), output: Repos,
  errors: { Unavailable: z.object({}) }, scope: 'public', freshness: 'request', runs: 'either' })
export const myRepos = query({ input: z.object({}), output: Repos, errors: { Unauthorized: z.object({}) },
  scope: 'user', freshness: 'request', tags: () => [reposTag()], runs: 'browser' })
export const star = mutation({ input: z.object({ repo: z.string() }), output: z.object({}),
  invalidates: () => [reposTag()], runs: 'browser' })
// feature.ts
export const repos = feature({ id: 'repos', intent, declarations: [model, views],
  fetch: new URL('./fetch.ts', import.meta.url) })
```

## Details
- **What runs where:** `'either'` is server-rendered on first paint (data in the HTML, cached per `freshness`), and
  later in-page reads and mutations call the API from the browser, never through the server. `'browser'` renders its
  `pending` branch on the server and reads after hydration. `'server'` always goes through the server.
- **Checked at the boundary:** inputs and outputs are checked against their schemas in the browser too; a wrong
  output is `Unexpected` with its path, `fail(Name, data)` is the declared error.
- `env` is the parsed `public` environment; server env and the session never reach fetch.ts.
- **fetch.ts runs in the browser** (and on the server for `'either'`). A token read in the browser is sent only to
  the API, never to your own server.
- **CSP:** Hozu adds every `connect` origin to the page's CSP `connect-src` (an `{ env }` entry reads that public env
  variable's URL at startup). An absolute URL in fetch.ts that `connect` does not list is HZ083; a call blocked at
  run time shows in `hozu browse`.
- The bundle (`bundleComponents`) carries fetch.ts for the browser.
- **Rules:** HZ081 (a missing or extra export, or `'either'` with user data), HZ082 (a `'browser'` query in a page
  `head` or `entries`; a browser mutation that invalidates a tag a server-cached query reads), HZ036 (a form that
  starts a `'browser'` mutation needs JS).
- **Static host:** pages with only `'browser'` / `'either'` data export completely; `exportStatic` lists in
  `needsServer` the server effects a page would still call.
