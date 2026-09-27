# ADR 0030 — `hozu add feature --with auth`: accounts in the scaffold

- Status: accepted (the user approved it after trial 0012)
- Motivation: in trial 0012, a notes app with accounts cost 2.79× Nuxt to build.
  - The scaffold had no sign-in, session or per-user data, so both Hozu runs assembled them from `reference.md` and
    `examples/`-style knowledge (18–22 turns).
  - The same app's change step, which the scaffold did not need to cover, was 2.06×.

## Decision
`--with auth` adds to the scaffold what an account-based app needs. It is taken from the verified `examples/notes`
account feature.
- **`features/account` (created once per app):**
  - `me` (user-scoped, `Unauthorized` when signed out), `signIn` (a name of 2–20 letters) and `signOut`;
  - a machine that navigates to the page after signing in and to `/login` after signing out;
  - a `Login` view (no-JS form, field error) and an `AccountBar` view (`Signed in as …`, `Sign out`);
  - contracts for every transition.
- **Wiring:**
  - `session` in `hozu.config.ts`, and a `/login` route and page;
  - the feature's page gets `AccountBar` and a head query on `me` that redirects `Unauthorized` to `login`;
  - `serve.ts` gets `sessionCookie({ name: 'sid', secret: process.env.SESSION_SECRET ?? <random>, secure: process.env.SESSION_SECURE === 'true' })`;
  - `server.ts` gets `accountResolvers`.
- **The feature itself:** its list and detail queries become `scope: 'user'` (the list with `Unauthorized`), and
  its resolvers keep one list per user.
- **A second feature with `auth`** reuses the existing account.
- **Not included:** passwords, registration, a database. The reference says to replace the name-only sign-in before
  production, and to set `SESSION_SECRET` / `SESSION_SECURE`.
- **`hozu get` / `hozu post`** now use a real signed session cookie (unless `--session` is given), so sign-in flows
  work across `--next` steps without a server.

## Principle check
- **Principle 8:** scope stays declared: the scaffold writes `scope: 'user'`, and the compiler keeps deriving
  rendering from it.
- **Principle 2:** sessions stay explicit, in `project({ session })` and `serve.ts`.
- **Principle 5:** every added transition comes with its contract.

## Verification
- `check` is clean for `auth` with every other part, and for a second `auth` feature.
- **A flow test:**
  - signed out, `/` redirects to `/login`;
  - ada signs in and adds a note; after signing out, bob signs in and does not see it;
  - a detail page of another user's item is 404;
  - the second feature's page also redirects when signed out.
- The gate is green.
- **Gate:** green, 265 tests. The runtime did not change, so parity keeps its 24/24.
