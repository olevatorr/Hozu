# Data: queries, mutations, tags, fn, resolvers

**First: whose data is it?** It decides `runs`, `scope` and where it is stored. When the request does not say, ask.

| The data | `runs` / `scope` | Stored in |
|---|---|---|
| the visitor's own, no sign-in (a watchlist, favourites, settings) | `'browser'` / `'user'` | `localStorage`, in `fetch.ts` (`hozu docs recipes`) |
| a signed-in user's, on every device | `'server'` / `'user'` + `access` | the app's database |
| everyone's (posts, a shared board) | `'server'` / `'public'` + a deliberate `access` | the app's database |
| a public third-party API (quotes, weather) | `'either'` / `'public'` | nowhere: read it |

The arrays in Hozu's examples and scaffolds are stand-ins that keep them short: one list for every visitor, gone on
restart. Never ship one; replace it with the store above.

```ts
export const itemsTag = tag({ param: null })                    // tag({ param: z.string() }) → itemTag(id)
export const listItems = query({
  input: z.object({}), output: z.array(Item),
  scope: 'public',                  // 'user' = the session's data (needs project({ session }))
  freshness: 'static',              // | 'request' | { revalidate: s } | { swr: s } | 'live' | { poll: s }
  tags: () => [itemsTag()],          // optional; (input) => [...]
  runs: 'server',                   // where the implementation lives: 'server' | 'browser' | 'either' (required); hozu docs fetch
})
export const getItem = query({ input: Key, output: Item, errors: { NotFound: Key }, scope: 'public',
  freshness: 'static', tags: (k) => [itemTag(k.id)], runs: 'server' })
export const addItem = mutation({
  input: z.object({ title: z.string().min(2, 'Use at least 2 characters') }), output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) },          // optional: declared failures
  invalidates: () => [itemsTag()],                                  // refreshes queries with these tags
  runs: 'server',
  access: 'anyone',                 // who may run it (required on the server; user queries too): hozu docs auth
})
export const visible = fn({                   // computation: pure JS; may call const/function helpers of this module
  input: z.object({ items: z.array(Item), show: Show }), output: z.array(Item),
  impl: ({ items, show }) => items.filter((i) => show === 'all' || !i.done),
})
```
```ts
export default app({ resolvers: resolvers(project, (implement) => [
  implement(listItems, () => db.items.list()),                     // db: the app's database client
  implement(getItem, async ({ id }, { fail }) => (await db.items.get(id)) ?? fail('NotFound', { id })),
  implement(addItem, ({ title }, { fail, session }) => /* … */ ),
]) })
```
- `runs` is required on every query and mutation. `'server'` resolvers live in `app.ts` (or `features/<name>/server.ts`)
  and get the schema-parsed input; `'browser'` / `'either'` live in `fetch.ts` (`hozu docs fetch`).
- **Query resolvers only read;** writes happen in mutation and endpoint resolvers (see --more).
- User data (`scope: 'user'`) is `freshness: 'request'`, `'live'` or `{ poll }` only (HZ049); `'live'` needs tags (HZ050).
- **Changes on its own** (quotes, a feed): `freshness: { poll: 30 }` reads it again every 30 s (5 to 86400) while a page
  shows it, also from the browser. `'live'` is for data your own mutations change. A refresh the visitor controls
  (a button, Pause / Resume) is `refresh: () => [tag()]` on a machine transition (`hozu docs machine`).
- Call a `fn` from views or machines: `ui.each(visible({ items, show: ctx.show }), 'id', …)`.
- **A database** (pool, migrations, numeric ids): see --more.

<!-- more -->

## Details
- A `fn` body may call functions and JSON constants declared in the same module; they are sent to the browser with
  it. Imported names and `let` state are not (HZ047): pass them as input.
- Rendering is derived: `scope` and `freshness` decide static, ISR, SWR, streamed or client rendering;
  `scope: 'user'` data never reaches a cached page (HZ022). A mutation's tags can read only its input.
- Freshness describes how the data changes, not where it is read; choose it per query. `'static'` (with tags) is
  for data only your own declared writers change; `'request'` reads every time it is needed (on the server per
  request, in the browser on mount and on tags; a public one makes its page uncacheable). `'live'` is only for push
  updates.
- `invalidates` drives the refresh: after a mutation or endpoint, cached pages and entries with those tags are
  dropped and the page's queries with those tags are re-read. `endpoint({ …, invalidates: (input) => [tag()] })`
  applies when it succeeds (use POST; a GET write is HZ062).
- Writes from outside (a webhook, a job): `await server.revalidate([itemsTag()])` → `{ entries, pages }`.
- **Why queries only read:** a query that creates a row on read runs again on every request, on prefetch and after a
  delete (the account comes back). Keep two helpers: `listOf(user)` returns the stored list or `[]` for queries;
  `ownListOf(user)` creates it, for mutations only.
- Resolvers in `features/<name>/server.ts` (from the scaffold) are spread into `app.ts`; the input they get has
  defaults and transforms applied.
- Every mutation also has `Invalid` = `{ message, fields }` (input failing its schema, or
  `fail('Invalid', { message, fields: { title: 'Taken' } })`); never declare `Invalid` or `Unexpected` yourself.

## Resolvers in another language (Go)
Only when the person asks for it or the service already exists in Go: TypeScript resolvers are the default and need
no second process. `remote()` sends server effects to a service over HTTP; everything else (access, caching, tags,
the output schema check) stays in the Hozu server, so a wrong answer is `Unexpected`, never a wrong page.
```ts
import { remote, resolvers } from '@hozu/data'
export default app({
  resolvers: resolvers(project, (implement) => [
    implement(me, (_, { session }) => ({ name: session?.user ?? '' })),
    ...remote(
      {
        url: { env: 'NOTES_SERVICE_URL' },
        secret: { env: 'NOTES_SERVICE_SECRET' },
        contract: new URL('./service/hozu/contract.go', import.meta.url),
      },
      [listNotes, addNote],
    ),
  ]),
})
```
- The loop: change the declaration in TypeScript → `npx hozu gen` (writes the contract: types, the `Resolvers`
  interface, `Handler`) → implement the interface until `go test ./...` passes → restart the service → `hozu check`.
  A contract older than the declarations is HZ093; the service answers 409 to calls from other declarations.
- In Go: return a declared error as the error value (`hozu.NotesAddNoteDuplicate{Text: t}`), `hozu.Invalid{…}` for
  input problems; `ctx.Session` is nil when signed out; `ctx.SetSession(…)` / `ctx.SignOut()` in mutations. Public
  queries never receive the session. `ctx.File(token)` reads an upload, `ctx.Header` an endpoint's request headers
  (no cookie), `ctx.Preview` preview mode. The secret is required (16+ characters, the same value on both sides,
  HZ093): the service trusts the session it is sent, so serve `hozu.Handler(r, hozu.Options{Secret: …})` on a private
  address (it refuses to start without one).
- `.meta({ title: 'Note' })` on a schema makes it one Go type wherever it appears; `z.int()` is `int64`, a plain
  number `float64`. Only `runs: 'server'` effects and JSON endpoints can be remote (HZ093).
- `examples/notes-go` is the reference: the notes app with every resolver in Go.

## A database
- One pool per process, made in `app.ts`; close it in `app({ dispose: () => pool.end() })` so `hozu get`, `call` and
  `browse` exit and `hozu serve` stops cleanly. Transactions belong in one mutation resolver (`BEGIN` … `COMMIT`).
- Migrations and seed data are scripts in `package.json` (`"db:migrate": "node db/migrate.ts"`), idempotent, run
  before `npm start`; the URL and password are server env (`project({ env: { server } })`, `hozu docs env`).
- Route params and form fields are strings: a numeric id is `z.coerce.number()` in the query or mutation input
  (a query input that fails its schema is a program error, reported to `onError` with the field).
- Data the whole staff shares but only staff may read is `scope: 'user'` with `access` (it is never cached across
  requests). Share one rule: `const staffOnly = part(({ session }) => session.role !== 'editor')`, then
  `access: { allow: staffOnly }` on each effect.
- A resolver may answer `fail('Forbidden', { message })` (a row deleted meanwhile, a check `access` cannot make);
  with `access: 'signedIn'` its `session` is never null.
- Another app writing the same database: give the reading app a signed `endpoint` that `invalidates` the tags, and
  call it after a write (`hozu docs endpoints`).
