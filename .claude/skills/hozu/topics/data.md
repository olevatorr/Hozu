# Data: queries, mutations, tags, fn, resolvers

```ts
export const itemsTag = tag({ param: null })                    // tag({ param: z.string() }) → itemTag(id)
export const listItems = query({
  input: z.object({}), output: z.array(Item),
  scope: 'public',                  // 'user' = per-session data (needs project({ session }))
  freshness: 'static',              // | { revalidate: seconds } | { swr: seconds } | 'live'
  tags: () => [itemsTag()],          // optional; (input) => [...]
})
export const getItem = query({ input: Key, output: Item, errors: { NotFound: Key }, scope: 'public',
  freshness: 'static', tags: (k) => [itemTag(k.id)] })
export const addItem = mutation({
  input: z.object({ title: z.string().min(2, 'Use at least 2 characters') }), output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) },          // optional: declared failures
  invalidates: () => [itemsTag()],                                  // refreshes queries with these tags
})
export const visible = fn({                   // computation: pure JS, self-contained (no imports, no helpers outside impl: HZ047)
  input: z.object({ items: z.array(Item), show: Show }), output: z.array(Item),
  impl: ({ items, show }) => items.filter((i) => show === 'all' || !i.done),
})
```
- Call a `fn` from views or machines with data: `ui.each(visible({ items, show: ctx.show }), 'id', …)`.
- Rendering is derived: `scope` and `freshness` decide static, ISR, SWR, streamed or client rendering;
  `scope: 'user'` data never reaches a cached page (HZ022). A mutation's tags can read only its input.
- **Resolvers** (`server.ts`, or `features/<name>/server.ts` from the scaffold):
```ts
export const createResolvers = () => resolvers(project, (implement) => [
  implement(listItems, () => items.map((i) => ({ ...i }))),
  implement(getItem, ({ id }, { fail }) => items.find((i) => i.id === id) ?? fail('NotFound', { id })),
  implement(addItem, ({ title }, { fail, session }) => /* … */ ),
])
```
- Every mutation also has `Invalid` = `{ message, fields }` (input failing its schema, or
  `fail('Invalid', { message, fields: { title: 'Taken' } })`); never declare `Invalid` or `Unexpected` yourself.
