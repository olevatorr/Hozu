# Sign-in, sessions, who may read and change what

- **Start:** `hozu add feature notes --page / --with auth` (sign-in page, sign-out, `me`); set `SESSION_SECRET`.
- `project({ session: z.object({ user: z.string() }) })`. `scope: 'user'` queries and mutations get `session`;
  a mutation calls `setSession(value)` (`null` signs out).
- **Every server-run user query and mutation says who may run it**, like `runs` (HZ088):
  - `access: 'signedIn'`: any signed-in visitor; the resolver reads that visitor's data by `session`.
  - `access: { owner: { row: (n) => n.owner, session: (s) => s.user } }`: the framework checks the output. One row
    that is not the visitor's is `Forbidden`; a list holding such rows is HZ091 (the resolver read too much).
  - On a mutation, `{ owner: { load: getNote, input: (i) => ({ id: i.id }), row: (n) => n.owner, session: (s) =>
    s.user } }` reads the row and checks it before the resolver runs; if `load` fails for any reason (`NotFound`
    too), the answer is `Forbidden` and the resolver does not run.
  - `access: { allow: ({ session, input }) => session.role === 'admin' }`.
  - `access: 'anyone'`: sign-in, a newsletter. On user data it is HZ090.
- **Refused** is the framework error `Forbidden`, before the resolver runs: optional in `failed` (otherwise
  `Unexpected`). A page answers 403, or maps it: `head: { query: me, …, failed: { Forbidden: login } }`.
- Check it as two visitors: `hozu call <effect> --session '{"user":"bob"}'`, or in one chain: `hozu browse /
  --as ada --session '{"user":"ada"}' --do 'remember note from li a @href' --as bob --session '{"user":"bob"}'
  --do 'goto $note'` (bob gets 403). `post <path> a=1` forges a native post as the current actor.

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
- A role on top of sign-in: `'signedIn'` plus a declared error (`NotAdmin`) mapped to 403 keeps "signed out → login"
  apart from "not allowed → 403" (`failed: { Forbidden: login, NotAdmin: 403 }`); `{ allow }` answers Forbidden for both.
- `access` is recorded in `hozu.lock.json`, so a change to it is reviewed like a transition.
- `owner` needs the row to carry its owner field (HZ088 otherwise): add it to the output, or use `'signedIn'` and
  read only the visitor's rows. In production a list's foreign rows are dropped and logged once.
- Public queries never see the session, and a browser-run effect is guarded by the API it calls: `access` there is
  HZ089.
- Calling another API with a token: a token your server holds goes in the session and is read in a `runs: 'server'`
  resolver; a token that lives in the browser (OIDC / SSO, `localStorage`) is read in a `runs: 'browser'` effect
  (`hozu docs fetch`) and never reaches your server.
- `SESSION_SECRET` is at least 32 characters: `openssl rand -hex 32`. Keep it in a git-ignored `.env` and list
  it in `.env.example` (`npx hozu env --example`).
- **A refused page** renders the page's views with status 403 (the `<title>` falls back to the site name). For a
  page of its own, map `Forbidden` (or a declared error) to a route: `failed: { Forbidden: login }`.
- **Order on a mutation:** the input schema first (`Invalid` with field errors), then access (`Forbidden`), then the
  resolver.
