# Sign-in, sessions, per-user data

- **Start from the scaffold:** `hozu add feature notes --page / --with auth` writes `features/account` (sign-in page,
  sign-out, `me`), the session cookie in `serve.ts`, per-user resolvers, and a redirect to `/login` when signed out.
  Replace the name-only sign-in with real credentials before production; set `SESSION_SECRET` (and
  `SESSION_SECURE=true` behind HTTPS).
- `project({ session: z.object({ user: z.string() }) })` declares the identity. Queries with `scope: 'user'` and all
  mutations receive `session`; public queries never do. A mutation calls `setSession(value)` (or `null` to sign out).
- `createServer({ session: sessionCookie({ name: 'sid', secret }) })` (from `@hozu/runtime-server`): a signed,
  HttpOnly cookie. The session never reaches browser JavaScript.
- Guard pages: `head: { query: me, redirects: { Unauthorized: login }, … }`.
- Calling another API with a token: keep the token in the session (server side) and read it in the resolver.
