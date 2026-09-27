---
title: Concepts
description: How features become a checked program and a derived render plan.
order: 2
---

## Your application is data

Hozu's typed builders record an intermediate representation, or IR. The validator checks that representation, the compiler derives a render plan, and the runtime serves it. TypeScript is the authoring surface; the IR is the shared source of truth.

```text
feature source → Feature IR → validator → compiler → runtime
```

This lets the tools answer questions about an application before serving it: which events a state accepts, which queries a mutation refreshes, or whether a page can be exported as static HTML.

## Features define boundaries

A feature groups related declarations: queries, mutations, events, views and, when needed, one state machine. Register each declaration once in its `declarations` object. Other features can use only declarations exposed through its `exports`; consumers declare the feature in `imports`.

Static content does not need a machine. Add one when the UI has an interaction with state or side effects.

## Behaviour has a contract

A machine describes states and transitions. A contract states the starting state, the events or effect results that occur, and the expected state, data changes and effects. Every transition needs coverage, including failure paths and timers.

`expect.changes` is a deep patch: omitted fields must remain unchanged, and arrays replace the old value. `given.context` defaults to the machine's initial context. A behaviour lock catches changes made without an accompanying contract change.

## Logic stays explicit

Values such as `ctx.title` inside view and machine callbacks are recorded references, not ordinary JavaScript values. Use `op.eq` for comparisons, `op.set` for assignments, and `ui.if` for conditional content. Do not branch on a reference with a JavaScript `if` or interpolate it into a template string.

When an operation needs ordinary JavaScript, declare a named `fn()` with input and output schemas. Client-used functions must be self-contained: their source is shipped independently, so they cannot close over imported helpers or local variables.

## Rendering follows the data

Each query declares its scope and freshness. Public static data can be rendered at build time. Revalidation and stale-while-revalidate policies produce their corresponding cache plans. User-scoped data stays out of shared cacheable regions.

Only machine-bound views hydrate. A static document has no need for a client application runtime. A page's optional `assert: 'static'` asks the validator to verify this property; it does not override the derived plan.

Use `npx hozu plan home` to see the compiler's decision for a named route.
