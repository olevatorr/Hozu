---
title: Why AI-first?
description: Hozu makes application behavior visible to tools, so an agent can check more than whether its code compiles.
order: 1
---

## A program an agent can inspect

Hozu starts with a practical question: what should a frontend framework make easy for an agent to verify? An agent can produce plausible code quickly, but a successful build says little about whether adding a feature preserves existing behavior. Hozu gives behavior, data ownership and rendering rules explicit forms that its tools can inspect before a browser opens.

The goal is to make invalid programs structurally difficult to express and valid programs cheap to verify. That is a design objective, not a claim that generated applications are automatically correct. Developers still decide what the application should do, write meaningful contracts and check the experience in a browser.

A Hozu application passes through `feature()` source, a Feature IR, a validator, a compiler and a runtime. IR means intermediate representation: structured data describing the program. TypeScript helps you author that data, while the IR gives every later stage the same account of the application. [ADR 0002](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0002-feature-ir-and-authoring.md) records the original decision.

## Put the decisions where tools can see them

Consider a reading list. Its declarations describe the item schema, the event that adds an item, the mutation that stores it and the query that reads the list. A machine describes when adding is allowed, what happens while the request is in flight and how success or failure changes the screen.

Those declarations belong to a feature. The registration below is a small excerpt from that arrangement; the named declarations are defined alongside it.

```ts
export const items = feature({
  id: 'items',
  intent: { summary: 'A reading list' },
  declarations: { Add, itemsTag, listItems, addItem, m, Board, adds },
})
```

A consumer imports another feature explicitly and uses only its exported declarations. Cross-feature references point at declaration identities instead of repeating names in loosely related strings. The framework can therefore distinguish an intentional public dependency from a view reaching into another feature's private behavior.

Views follow the same approach. A `ui()` tree records elements, conditions, lists and event bindings. It does not hide network requests inside arbitrary rendering functions. Operators, conditions and assignments are written as ordinary TypeScript and recorded as data by a source transform; any other computation has a named, schema-typed `fn()` boundary.

## A concrete failure worth designing around

The notes application in trial 0012 tests account isolation, double submission, forms without JavaScript and a later pinning and search change. Both frameworks passed every build check in both runs. During the change, one Nuxt run introduced failures that its type check and production build did not catch.

The trial identifies the cause:

> The pin handler mutates `note.pinned` in place on `useFetch` data, which Nuxt 4 keeps in a shallow ref, so the sorted list and later refreshes stop updating.

That run also stopped showing newly added notes and kept deleted notes visible. The report records 72/72 checks across the Hozu runs and 67/72 across the Nuxt runs. This is evidence of one specific regression in two Nuxt runs, not an estimate of either framework's general failure rate. Read the setup and reproduced failures in [trial 0012](/trials/0012-correctness-notes).

Hozu targets this category of mistake through separate, complementary mechanisms. Contracts exercise machine transitions; query tags and mutation invalidation give the framework responsibility for refreshing data. These mechanisms reduce the amount of synchronization code an application author must coordinate, but neither proves that a resolver implements the product requirement correctly.

## Verification has a cost

Explicit behavior takes source code and reading time. On the task board, trial 0010 measured Hozu at 1.64× Nuxt's weighted tokens for building and 1.44× for changing. Both frameworks passed the acceptance checks. The build missed the trial's target, while the change met it. [Trial 0010](/trials/0010-map-scaffold-recipes) includes the complete comparison.

The notes trial measured 2.79× for building and 2.06× for changing before the account scaffold existed. Adding that scaffold brought the build comparison to 1.66× in trial 0013, using two new Hozu runs and the earlier Nuxt baseline. That improvement concerns a particular workflow and task; it does not establish a universal productivity advantage. [Trial 0013](/trials/0013-notes-with-auth-scaffold) records the scope.

A study of every trial transcript then found where the remaining cost was: mostly reading the guide, multiplied by the number of calls an agent makes, not writing code ([ADR 0038](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0038-cost-anatomy.md)). Hozu 0.5 answered that by letting callbacks use ordinary TypeScript and by splitting the guide into topics found with `hozu docs`. On the same notes task, four runs per step measured 1.38× Nuxt to build and 1.45× to change, and all five runs, one of them by Codex, passed every check. [Trial 0016](/trials/0016-0-5-four-runs) has the details and the limits.

## Start with the questions you need answered

An agent can use `hozu map` to locate the relevant declarations, `hozu inspect` to examine a feature and `hozu explain` to understand a state. `hozu check` combines type checking, rules and contracts. `hozu get` and `hozu post` then exercise rendered pages and native forms without starting a server.

That workflow is the practical meaning of AI-first here: expose decisions, make their relationships inspectable and return actionable failures. Continue with [the pipeline](/how-it-works/pipeline), or use the shorter [agent workflow guide](/docs/ai-agents) to try it in an application.
