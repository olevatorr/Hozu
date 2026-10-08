---
title: From source to a running application
description: Follow one feature through recording, validation, render planning and execution.
order: 2
---

## One representation connects the tools

Hozu's pipeline is `feature() source → Feature IR → validator → compiler → runtime`. Each stage has a different responsibility. The author describes the program, the builder records it, the validator checks its relationships, the compiler derives execution decisions and the runtime carries them out.

The intermediate representation keeps those stages connected. A view event, a machine transition and an invoked mutation become related entries in structured data. Tools can inspect those relationships directly instead of trying to infer them from arbitrary application functions. [ADR 0002](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0002-feature-ir-and-authoring.md) explains why the IR is the source of truth.

## Source records a program

TypeScript gives declarations useful editor feedback and typed references. A route describes its parameters, an event describes its payload and a query describes its input and output. A feature registers those declarations under stable names, together with its views and any machine or contracts.

The callbacks used to author a view or machine run as recorders. A value such as `ctx.draft` represents a path that the eventual program will read. It is not the current contents of an input field while the builder runs. Authors still write ordinary TypeScript; `@hozu/transform` rewrites the operators before the callback runs, so the condition is recorded rather than decided once.

For example, a view can record whether an error message exists:

```ts
ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])
```

The transform turns this into a conditional node whose test (`error ≠ null`) and branch remain visible in the IR. The transform only rewrites operators that touch recorded values, keeps every line in place so diagnostics point at the author's code, and refuses what it cannot record (a method on data) with a diagnostic. For computation outside the operator vocabulary, a named `fn()` supplies input and output schemas and a pure implementation. It is an explicit boundary the tools can identify ([ADR 0039](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0039-ordinary-typescript-in-builders.md)).

## Validation checks the relationships

The validator checks more than the shape of individual declarations. It can find a reference to an unregistered mutation, an event that a visible control sends into a state that cannot handle it, or a feature that accesses another feature's private declaration. Render-related checks also prevent user-scoped data from entering a shared cacheable region.

Contracts add execution to those structural checks. They place a machine in a known state, send events or effect results and compare the resulting state, context and effects with the author's expectation. Transition coverage identifies the transitions that decide (a guard, a navigation, a computed value) and have no contract. The behaviour lock, `hozu.lock.json`, records every transition, who may run each query and mutation, the endpoints, redirects and how each page answers a failed head query; `hozu check` recomputes it and reports any difference (HZ057), so a change is accepted only with `hozu check --update-lock`.

Diagnostics identify a location, cause and suggested fix. The JSON form supports tooling, while the text form makes the same information readable in a terminal. Some failures require a decision about intent, so a useful diagnostic does not always include an automatic patch. The diagnostic design is documented in [ADR 0003](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0003-diagnostics-and-cli.md).

## Compilation derives the plan

The compiler reads the validated program and follows its dependencies. Query scope and freshness determine cache and request behaviour. Machine bindings determine which nodes need client execution. A page can therefore combine a static shell, request-specific content and small interactive islands without one manually selected rendering mode for the entire route.

Server HTML uses generated JavaScript for subtrees that do not suspend. Query streaming retains an interpreted path around suspension points, so the server can flush earlier content before waiting for data. A production build writes the render module for deployment; Node development uses the same generator at startup. [ADR 0024](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0024-generated-render-functions.md) describes that division.

The runtime then executes the plan. Server resolvers provide query and mutation results, the machine interpreter processes events and the browser runtime updates the islands that require it. Static nodes need no client application runtime merely because they share a page with an interactive control.

## Ask the narrowest useful question

Start a change with `hozu map`. It lists routes, data declarations, events, states, views and contracts with source locations. Open the relevant application code, then use a more focused tool when the relationship you need is still unclear.

```sh
pnpm exec hozu map
pnpm exec hozu inspect items
pnpm exec hozu why items.idle
pnpm exec hozu plan home
```

`inspect` exposes a feature's summary and IR. `why` describes a state's transitions, effects and covering contracts. `plan` shows the rendering decision for a route or path: each region with its mode and the queries behind it, whether the page is cacheable, and its islands. These commands answer different questions, so running all of them for every small edit adds unnecessary work.

After an intended change, `hozu check` runs the combined verification. Use `hozu get` for rendered text, attributes and forms, and `hozu browse` for a flow in a real browser. The [CLI reference](/docs/cli) lists the commands, and [machines and contracts](/how-it-works/machines-and-contracts) explains the behaviour checks in detail.
