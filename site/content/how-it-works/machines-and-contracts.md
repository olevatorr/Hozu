---
title: Machines and contracts
description: Make a feature’s allowed transitions explicit, then check them against its intended behaviour.
order: 3
---

## Start with an interaction

Imagine a form that saves a reading-list item. Before submission, the user can edit a title. During the request, a repeated click must not start another save. A successful response clears the form; a rejected response explains the problem. Those are product decisions, even if a conventional component spreads them across handlers, loading flags and promise callbacks.

Hozu puts those decisions into a machine. A feature has at most one machine, while a static feature can have none. The machine declares its context, initial values, initial state and transitions. Events, effects and their schemas are separate declarations registered in the same feature. This makes the interaction available to inspection before the application starts.

## A transition is a specific decision

A small acknowledgement illustrates the shape without involving a server. A visitor acknowledges a notice, sees confirmation, and returns to the initial state after the declared delay. The event carries an explicitly empty payload, and the machine has an explicitly empty context because its state already describes the whole interaction.

```ts
import { event, machine, on } from '@hozu/core'
import { z } from 'zod'

export const Acknowledge = event({ payload: z.object({}) })
export const notice = machine({
  context: z.object({}),
  initialContext: {},
  initial: 'idle',
  states: () => ({
    idle: { on: [on(Acknowledge, { target: 'acknowledged' })] },
    acknowledged: {
      ignore: [Acknowledge],
      after: [{ ms: 2000, target: 'idle' }],
    },
  }),
})
```

Here, the delay is an illustrative application choice, not a measured framework result. The framework owns the timer. The `ignore` declaration makes repeated acknowledgements intentional instead of leaving a visible event unhandled. A transition back to the same state would re-enter it, which matters especially when state entry invokes a mutation.

For the reading-list form, a busy state instead declares `invoke(addItem, ...)`. Its `done` transitions describe successful results, and its `failed` transitions handle declared errors plus the framework’s unexpected-error path. The form sends an event; it does not hide an asynchronous request inside its view. See the [data guide](/docs/data) for that boundary.

## State what the transition must do

A contract starts from a known state, supplies an event or effect result, and states the expected outcome. This acknowledgement needs a contract for the event and another for the timer:

```ts
import { contract } from '@hozu/core'

export const acknowledges = contract(notice, {
  given: { state: 'idle' },
  when: [{ send: Acknowledge, payload: {} }],
  expect: { state: 'acknowledged' },
})
export const resets = contract(notice, {
  given: { state: 'acknowledged' },
  when: [{ elapse: 2000 }],
  expect: { state: 'idle' },
})
```

Register the event, machine, views and contracts in the feature’s `declarations`. HZ016 reports transitions without contract coverage. Coverage includes event transitions, invoked effects’ success and failure paths, and scheduled transitions. A covered happy path does not excuse an unspecified error path.

When context is involved, `given.context` defaults to the machine’s initial context. `expect.changes` states a deep patch: unmentioned fields must remain equal, while arrays replace their previous value. Expected effects are explicit; omitting `expect.effects` means no effects are expected. This keeps a contract focused on the behaviour it is meant to establish while still detecting unintended changes elsewhere.

## Keep the lock tied to intent

The behaviour lock records accepted behaviour. HZ018 detects behavioural changes that lack the corresponding contract change. The point is to prevent a plausible edit from silently redefining what a feature does. It is not an invitation to update expectations until an incorrect implementation passes.

Suppose the acknowledgement should now last longer. Decide that requirement first, change the timer and its time-based contract together, and run the checks. Once the change is intended and clean, `hozu check --update-lock` accepts the new baseline. The same process applies when a mutation begins navigating after success or a guard changes which submissions are allowed.

The original interpreter and contract design is recorded in [ADR 0004](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0004-machine-runtime-and-contracts.md). The shorter contract authoring form is explained in [ADR 0022](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0022-authoring-surface-diet.md). Historical examples use the former framework name; the principles remain relevant, while the installed skill defines today’s syntax.

## Know the boundary of the proof

A contract checks the machine against an expectation you wrote. It does not prove that the expectation matches the product requirement, that a database persists correctly, or that a button is easy to reach on a phone. Resolver tests, rendered-page checks and browser checks still have jobs to do.

Use `hozu explain feature.state` when you need to understand the transitions and their covering contracts. Run `hozu check` after editing, then exercise the resulting page with `hozu get` or `hozu post`. The useful outcome is a chain of evidence: an explicit requirement, a checked transition, and a visible result that agrees with both.
