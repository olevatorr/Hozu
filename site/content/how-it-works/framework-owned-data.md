---
title: Framework-owned data
description: Declare reads, writes and invalidation together, so refresh behaviour is not scattered across handlers.
order: 5
---

## The difficult part is keeping the screen correct

Reading a list and sending a write request are straightforward operations. The difficult part is coordinating the screen afterwards: which queries are stale, which components display them, whether an optimistic value is still visible, and whether a later refresh actually reaches the rendered list. An application can compile while that coordination is wrong.

Hozu makes reads and writes explicit declarations. Queries describe their input, output, ownership and freshness. Mutations describe their input, output, errors and invalidated tags. Server code implements those declarations, while the framework owns the relationship between a successful write and the queries that must refresh.

## A regression that passed the build

Trial 0012 asked agents to build a personal notes app and then add pinning and in-browser search. The acceptance checks covered the changed behaviour and the original application again. Both Hozu builds and both Nuxt builds initially passed all their build checks. One Nuxt change then broke pin ordering and several previously working refresh behaviours.

The report gives this cause:

> The pin handler mutates `note.pinned` in place on `useFetch` data, which Nuxt 4 keeps in a shallow ref, so the sorted list and later refreshes stop updating.

The same report states that `pnpm typecheck` and `pnpm build` both passed and the agent reported success. The reproduced regressions included a newly added note not appearing, a double-clicked note not appearing at all, and a deleted note staying listed. This is a particular generated implementation’s failure, not a claim that Nuxt cannot implement the application correctly.

Across build, change and regression checks, the Hozu runs passed 72/72 and the Nuxt runs passed 67/72. The trial explicitly describes the evidence as small: one failure in two runs. Read [trial 0012](/trials/0012-correctness-notes) for the acceptance design, reproduced failures and cost comparison before drawing broader conclusions.

## Connect the read and the write

A list-wide tag is a declaration that queries and mutations can reference by identity. A query says which tags describe its result; a mutation says which tags its write invalidates. The following excerpt shows that relationship for a public reading list:

```ts
export const itemsTag = tag({ param: null })
export const listItems = query({
  input: z.object({}),
  output: z.array(Item),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
  runs: 'server',
})
export const addItem = mutation({
  input: z.object({ title: z.string().min(2) }),
  output: Item,
  invalidates: () => [itemsTag()],
  runs: 'server',
  access: 'anyone',
})
```

Export the tag and both effects from a module the feature lists in its declarations. After the mutation succeeds, the framework can identify and refresh the affected query data. The view does not have to manually mutate a cached array and separately persuade another reactive layer that the value changed. For a private notes application, the list query instead declares user scope and receives the session identity through its resolver.

Tags can also carry a schema-typed parameter. That allows an item query to use a tag for its own key while a broader list uses another tag. Choose the invalidation boundary that matches the write. A tag that is too narrow can leave related data stale; a tag that is too broad causes avoidable refreshes. Explicit declarations make that decision inspectable, but do not choose your domain model for you.

## Keep implementation on the server

A query or mutation declaration is a contract for an effect, not its database implementation. `resolvers(project, implement => [...])` binds the implementation to the declaration identity. The resolver can call a database, read a Markdown collection or use an in-memory store in a demonstration application.

A view reads through `ui.query`. A mutation runs when the feature’s machine enters a state that invokes it. Success and declared failures return through the machine’s transitions, with contracts describing the intended response. Input validation failures use the framework’s `Invalid` error shape, which can provide field-level messages.

This separation means that the same view can keep its data contract while the storage implementation changes. Who may run an effect is not left to the resolver: every server-run user query and mutation declares `access` (`'signedIn'`, an owner rule, an `allow` condition or `'anyone'`), and the framework refuses with `Forbidden` before the resolver runs. An owner rule also checks the rows a query returns. The resolver remains responsible for persistence and correct domain behaviour: a typed result does not prove that the database query selected the right records.

## Choose where each effect runs

Every query and mutation declares `runs`. `'server'` is the resolver above: a database, a secret or the session. `'browser'` and `'either'` are implemented in the feature's `fetch.ts` (`feature({ fetch })`, since 0.11): a `'browser'` effect never runs on the server, so a token that lives in the browser stays there, and the server renders the region's pending branch; an `'either'` effect over public data is rendered on the server first and read from the browser afterwards. The browser checks every answer against the same JSON Schemas ([ADR 0049](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0049-0-11-where-effects-run.md)).

A `runs: 'server'` effect does not have to be TypeScript either. Since 0.22, `remote(options, [declarations])` in `@hozu/data` sends those effects to a service in Go, and `hozu gen` writes the Go contract from the declarations: one struct per schema, one error type per declared failure, one interface to implement. Access, caching, tags, invalidation and the check of each answer against its output schema stay in the Hozu server, so a service that answers wrongly fails as `Unexpected`; a declaration that changes without `hozu gen` is HZ093. `examples/notes-go` passes the notes app's hidden acceptance with every resolver in Go ([ADR 0068](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0068-resolvers-in-go.md)).

## Do not fetch the initial result twice

When the server has fetched a query, it serializes the result into the page payload. Hydration consumes that result rather than issuing the same initial request again. Later requests for new keys, mutation-driven refreshes and live updates are distinct operations; avoiding a duplicate initial fetch does not prohibit the application from ever reading fresh data. Two declared forms read again without a write: `freshness: { poll: s }` re-reads the mounted data on a timer (since 0.19), and a transition's `refresh: () => [tag()]` re-reads the queries carrying that tag when the person asks, for example from a Reload button (since 0.20), without invalidating any cache.

The data-layer design, including cache keys, tags and deduplication, is recorded in [ADR 0005](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0005-data-layer.md). The [data guide](/docs/data) provides the shorter authoring reference. Combine these declarations with meaningful machine contracts and page-level checks: framework-owned refresh removes one category of handwritten coordination, while acceptance tests still establish that the result meets the user’s requirement.
