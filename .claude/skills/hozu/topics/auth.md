# Sign-in, sessions, per-user data

- **Start from the scaffold:** `hozu add feature notes --page / --with auth` writes `features/account` (sign-in page,
  sign-out, `me`), per-user resolvers, and a redirect to `/login` when signed out. Replace the name-only sign-in with
  real credentials before production; set `SESSION_SECRET` (production without it refuses to start).
- `project({ session: z.object({ user: z.string() }) })` declares the identity. Queries with `scope: 'user'` and all
  mutations receive `session`; public queries never do. A mutation calls `setSession(value)` (or `null` to sign out).
- Sessions live on the server: the default store is `memorySessions()` (from `@hozu/runtime-server`); the cookie holds
  only an opaque, signed, HttpOnly id, so `setSession(null)` revokes it and the session never reaches browser
  JavaScript. It is per process: a restart signs everyone out, and an edge or multi-instance deployment passes a
  shared store explicitly (`createHandler({ session })`).
- `setSession` also applies in a failing mutation (expiry: `setSession(null)` then `fail('Expired', …)`).
- After a sign-in or sign-out the page's queries are re-read with the new session; nothing from the old one stays.
- Guard pages: `head: { query: me, …, failed: { Unauthorized: login } }`; a role check answers 403 with
  `failed: { Unauthorized: login, Forbidden: 403 }` (`hozu docs pages`).
- Calling another API with a token: keep the token in the session (server side) and read it in the resolver.
