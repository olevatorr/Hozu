# Sign-in, sessions, per-user data

- **Start:** `hozu add feature notes --page / --with auth` (sign-in page, sign-out, `me`); set `SESSION_SECRET`.
- `project({ session: z.object({ user: z.string() }) })`. `scope: 'user'` queries and mutations get `session`;
  a mutation calls `setSession(value)` (`null` signs out).
- Guard: `head: { query: me, …, failed: { Unauthorized: login } }` (`hozu docs pages`).

<!-- more -->

## Details
- The scaffold writes `features/account` (sign-in page, sign-out, `me`), per-user resolvers, and a redirect to
  `/login` when signed out. Replace the name-only sign-in with real credentials before production; production
  without `SESSION_SECRET` refuses to start.
- Public queries never receive `session`.
- Sessions live on the server: the default store is `memorySessions()` (from `@hozu/runtime-server`); the cookie holds
  only an opaque, signed, HttpOnly id, so `setSession(null)` revokes it and the session never reaches browser
  JavaScript. It is per process: a restart signs everyone out, and an edge or multi-instance deployment passes a
  shared store explicitly (`createHandler({ session })`).
- `setSession` also applies in a failing mutation (expiry: `setSession(null)` then `fail('Expired', …)`).
- After a sign-in or sign-out the page's queries are re-read with the new session; nothing from the old one stays.
- A role check answers 403 with `failed: { Unauthorized: login, Forbidden: 403 }`.
- Calling another API with a token: a token your server holds goes in the session and is read in a `runs: 'server'`
  resolver; a token that lives in the browser (OIDC / SSO, `localStorage`) is read in a `runs: 'browser'` effect
  (`hozu docs fetch`) and never reaches your server.
