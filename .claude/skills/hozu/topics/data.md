# Data: queries, mutations, tags, fn, resolvers

```ts
export const itemsTag = tag({ param: null })                    // tag({ param: z.string() }) → itemTag(id)
export const listItems = query({
  input: z.object({}), output: z.array(Item),
  scope: 'public',                  // 'user' = the session's data (needs project({ session }))
  freshness: 'static',              // | 'request' | { revalidate: seconds } | { swr: seconds } | 'live'
  tags: () => [itemsTag()],          // optional; (input) => [...]
})
export const getItem = query({ input: Key, output: Item, errors: { NotFound: Key }, scope: 'public',
  freshness: 'static', tags: (k) => [itemTag(k.id)] })
export const addItem = mutation({
  input: z.object({ title: z.string().min(2, 'Use at least 2 characters') }), output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) },          // optional: declared failures
  invalidates: () => [itemsTag()],                                  // refreshes queries with these tags
})
export const visible = fn({                   // computation: pure JS; may call const/function helpers of this module
  input: z.object({ items: z.array(Item), show: Show }), output: z.array(Item),
  impl: ({ items, show }) => items.filter((i) => show === 'all' || !i.done),
})
```
- Call a `fn` from views or machines with data: `ui.each(visible({ items, show: ctx.show }), 'id', …)`.
- A `fn` body may call functions and JSON constants declared in the same module; they are sent to the browser with
  it. Imported names and `let` state are not (HZ047): pass them as input.
- Rendering is derived: `scope` and `freshness` decide static, ISR, SWR, streamed or client rendering;
  `scope: 'user'` data never reaches a cached page (HZ022). A mutation's tags can read only its input.
- Freshness: public data is `'static'` with tags unless it changes without a declared writer. `'request'` reads
  once per request (any scope; a public one makes its page uncacheable). User data is `'request'` or `'live'` only
  (HZ049). `'live'` is only for push updates and needs tags (HZ050).
- `invalidates` drives the refresh: after a mutation or endpoint, cached pages and entries with those tags are
  dropped and the page's queries with those tags are re-read. `endpoint({ …, invalidates: (input) => [tag()] })`
  applies when it succeeds (use POST; a GET write is HZ062).
- Writes from outside (a webhook, a job): `await server.revalidate([itemsTag()])` → `{ entries, pages }`.
- **Query resolvers only read.** Writes happen in mutation and endpoint resolvers: a query that creates a row on read
  runs again on every request, on prefetch and after a delete (the account comes back). Keep two helpers:
  `listOf(user)` returns the stored list or `[]` for queries; `ownListOf(user)` creates it, for mutations only.
- **Resolvers** (`server.ts`, or `features/<name>/server.ts` from the scaffold) get the schema-parsed input
  (defaults and transforms applied):
```ts
export const createResolvers = () => resolvers(project, (implement) => [
  implement(listItems, () => items.map((i) => ({ ...i }))),
  implement(getItem, ({ id }, { fail }) => items.find((i) => i.id === id) ?? fail('NotFound', { id })),
  implement(addItem, ({ title }, { fail, session }) => /* … */ ),
])
```
- Every mutation also has `Invalid` = `{ message, fields }` (input failing its schema, or
  `fail('Invalid', { message, fields: { title: 'Taken' } })`); never declare `Invalid` or `Unexpected` yourself.
