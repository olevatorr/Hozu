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

Here, the delay is an illustrative application choice, not a measured framework result. The framework owns the timer. The `ignore` declaration makes repeated acknowledgements intentional instead of leaving a visible event unhandled. An `on` without a `target` stays where it is (since 0.20): timers and an invoked effect carry on. Naming the current state as the target re-enters it, which matters especially when state entry invokes a mutation.

For the reading-list form, a busy state instead declares `invoke(addItem, ...)`. A state with `invoke` drops every event it does not handle, so the repeated click needs no declaration. Its `done` transitions describe successful results, and its `failed` transitions handle declared errors plus the framework’s unexpected-error path. The form sends an event; it does not hide an asynchronous request inside its view. See the [data guide](/docs/data) for that boundary.

## State what the transition must do

A contract starts from a known state, supplies an event or effect result, and states the expected outcome. Since 0.5 ([ADR 0037](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0037-0-5-lower-reading-and-writing-cost.md)), contracts are required where a transition *decides* something: a guard that chooses between outcomes, a navigation, or a value computed by a `fn`. The acknowledgement above only moves between states, so it needs none; its transitions are recorded in `hozu.lock.json` in readable form:

```text
idle --Acknowledge--> acknowledged
acknowledged --after 2000ms--> idle
```

A guarded transition is different. If acknowledging is only allowed once a notice has been read, the machine keeps that in its context and the transition guards on it:

```ts
export const notice = machine({
  context: z.object({ read: z.boolean() }),
  initialContext: { read: false },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Acknowledge, { target: 'acknowledged', guard: () => ctx.read === true })] },
    acknowledged: {
      ignore: [Acknowledge],
      after: [{ ms: 2000, target: 'idle' }],
    },
  }),
})
```

Now the transition decides, so a contract states that decision:

```ts
import { contract } from '@hozu/core'

export const acknowledgesRead = contract(notice, {
  given: { state: 'idle', context: { read: true } },
  when: [{ send: Acknowledge, payload: {} }],
  expect: { state: 'acknowledged' },
})
```

Export the event, machine, views and contracts from the modules the feature lists in `declarations`. HZ016 reports decisions without a contract, with a skeleton ready to fill in. A covered happy path does not excuse an unspecified error path that computes or navigates.

When context is involved, `given.context` defaults to the machine’s initial context. `expect.changes` states a deep patch: unmentioned fields must remain equal, while arrays replace their previous value. Expected effects are explicit; omitting `expect.effects` means no effects are expected.

## Keep the lock tied to intent

The behaviour lock records accepted behaviour. HZ018 detects a change: for a decision, it asks for the matching contract change; for a transition that only copies values, it shows the change as `was: … now: …`. The point is to prevent a plausible edit from silently redefining what a feature does. It is not an invitation to update expectations until an incorrect implementation passes.

Suppose the acknowledgement should now last longer. Decide that requirement first, change the timer, and run the checks: HZ018 shows `acknowledged --after 2000ms--> idle` becoming `after 5000ms`. Once the change is intended, `hozu check --update-lock` accepts the new baseline. The same process applies when a mutation begins navigating after success or a guard changes which submissions are allowed.

The original interpreter and contract design is recorded in [ADR 0004](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0004-machine-runtime-and-contracts.md). The shorter contract authoring form is explained in [ADR 0022](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0022-authoring-surface-diet.md). Historical examples use the former framework name; the principles remain relevant, while the installed skill defines today’s syntax.

## Smaller forms for common decisions

A few shorter forms keep the machine readable without hiding a decision:
- `ui.set(ctx.field, value)` in a view sends a framework-made event that assigns one context field (since 0.21); the payload is checked against the context schema, and busy states ignore it.
- `target: 'previous'` returns to the state the machine was in before the current one, for example after closing a dialog (since 0.19); contracts give it `given.previous`.
- A mode the person sets, such as paused or a list layout, is a context field rather than a state, so a busy state that saves something does not reset it (the 0.25 guide).
- `ui.send(Open, {}, { keys: ['Mod+k', '/'] })` on `keydown` sends only for those keys (since 0.25). A key without a modifier waits while the person types in a field, and nothing fires while an input method composes.
- A transition that stops deciding, because its guard, navigation or computed value was removed, is reviewed by the lock alone (since 0.19): HZ018 asks for `hozu check --update-lock`, and HZ058 then names the contracts that no longer cover a decision.

## Know the boundary of the proof

A contract checks the machine against an expectation you wrote. It does not prove that the expectation matches the product requirement, that a database persists correctly, or that a button is easy to reach on a phone. Resolver tests, rendered-page checks and browser checks still have jobs to do.

Use `hozu why feature.state` when you need to understand the transitions and their covering contracts. Run `hozu check` after editing, then exercise the resulting page with `hozu get` or `hozu browse`. The useful outcome is a chain of evidence: an explicit requirement, a checked transition, and a visible result that agrees with both.
