---
title: Machines and contracts
description: Write a feature's behaviour as states and transitions, and review every change to it.
order: 5
---

## One machine per feature

A machine holds a feature's interactive state: its `context` (data, typed by a schema), its states, and the transitions that events and effect results cause. A view that declares `machine` hydrates; everything else ships no JavaScript.

```ts
import { event, invoke, machine, mutation, on, tag } from '@hozu/core'
import { z } from 'zod'

const Item = z.object({ id: z.string(), title: z.string() })
export const itemsTag = tag({ param: null })
export const Add = event({ payload: z.object({ title: z.string() }) })

export const addItem = mutation({
  input: z.object({ title: z.string().min(2, 'Use at least 2 characters') }),
  output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [itemsTag()],
  runs: 'server',
  access: 'anyone',
})

export const items = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable() }),
  initialContext: { draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [on(Add, { target: 'adding', guard: (e) => e.title.length >= 2, assign: (e) => { ctx.draft = e.title } })],
    },
    adding: {
      invoke: invoke(addItem, {
        input: { title: ctx.draft },
        done: { target: 'idle', assign: () => { ctx.draft = '' } },
        failed: {
          Duplicate: { target: 'idle', assign: () => { ctx.error = 'duplicate' } },
          Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } },
        },
      }),
    },
  }),
})
```

- **`assign`** writes context in ordinary TypeScript: `ctx.x = v`, `ctx.n += 1`, `ctx.list.push(item)`, `ctx.list = ctx.list.filter((i) => i.id !== e.id)`.
- **`guard`** is a condition: a field alone (`() => ctx.auto`), comparisons, `&&`, `||`, `!` or a boolean `fn()`. The first matching transition wins.
- Export the machine and its events from `model.ts`, which the feature lists in `declarations: [model, views]`.

## Effects and busy states

A state with **`invoke`** runs a mutation, or reads a query, when it is entered. `done` and every `failed` entry take a state name, one transition or a list of guarded transitions; `failed` lists each declared error plus `Unexpected` (`Invalid` and `Forbidden` are optional; see [Forms](/docs/forms)).

Such a busy state drops every event it does not handle, so a second click cannot start the effect again. A view can still read it: `disabled: is(['adding'])`.

`target: 'previous'` (or `done: 'previous'`) returns to the last state without `invoke`, so a saving state entered from both viewing and editing needs no copy per mode.

## Time, shared transitions and setting a field

- **`after`** fires after a delay while the state lasts: `after: [{ ms: 3000, target: 'idle' }]` for a toast, or `after: [{ ms: 30_000, target: 'live', guard: () => !ctx.paused, refresh: () => [quotesTag()] }]` to read again every 30 seconds unless paused. Naming the state enters it again, which restarts its timers.
- **An `on` without `target` stays:** timers keep running and an `invoke` keeps going.
- **`machine({ on })`** lists transitions copied into every state that has no `invoke`, is not final, and does not handle or ignore the event itself. One contract covers every copy.
- **`ui.set(field, value)`** in a view sets a context field without an event of yours: `on: { input: ui.set(ctx.q, ui.dom.value) }`. The build adds the event and a staying shared transition that copies the value, as if you had written them.

A mode the person sets, such as paused or a grid layout, is a context field, not a state: a busy state then keeps it, and the view reads it as `ctx.paused ? resumeButton : pauseButton`. Use `is([...])` for the machine's own states.

## What a transition can do

| Field | Effect |
| --- | --- |
| `navigate: (r) => ui.link(itemPage, { id: r.id })` | Loads another page after the transition. To choose between links, write one guarded transition per link. |
| `replace: () => ui.link(home, null, { q: ctx.q })` | Writes the address without loading a page, so a reload or a shared link keeps it (with a view's `seed`). |
| `refresh: () => [quotesTag()]` | Reads the page's queries with those tags again: a Refresh button. It writes nothing. |
| `copy: (e) => e.url` | Writes text to the clipboard, on an event right after a click. |

Effects and `navigate` read the context after `assign`. A view with a route can start the machine from the address or server data with `seed` ([Concepts](/docs/concepts)); state a page shares with the next stays with the visitor through a view both pages show.

## Contracts for transitions that decide

A transition **decides** when it has a guard, a `navigate`, a `fn()` call or a computing operator (`+`, `-`, `??`, `?:`, `.length`, `.includes`) in its values. Each one needs a contract; HZ016 prints the missing ones, ready to paste. Export contracts from `views.ts`:

```ts
import { contract } from '@hozu/core'
import { Add, addItem, items } from './model.ts'

export const addsValid = contract(items, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Milk' } },
    { done: addItem, result: { id: 'i9', title: 'Milk' } },
  ],
  expect: {
    state: 'idle',
    changes: {},
    effects: [{ effect: addItem, input: { title: 'Milk' } }],
  },
})
```

- `given.context` is a deep patch over `initialContext`; `given.previous` names the state a `'previous'` transition returns to.
- `when` holds `send`, `done`, `failed` (with `error` and `data`) and `elapse: ms` steps.
- `expect.changes` lists only what changes (nested objects are patches, arrays replace); `effects` defaults to none and includes `{ navigate: '/items/i9' }`.
- A failing contract is HZ015: decide which one is intended, the machine or the contract, before changing either.

## The lock reviews the rest

Transitions that only copy values need no contract; a contract over them is HZ058. `hozu.lock.json` records every transition in readable lines and must equal the lock Hozu computes (HZ057). After an intended change:

```sh
npx hozu check --update-lock
```

It prints the accepted `now:` lines; list them in your summary for review. A change to a deciding transition is accepted only with a contract that fails against the old behaviour (HZ018). A transition that stops deciding needs only the lock: update it, then delete the contracts HZ058 names. `npx hozu why <feature>.idle` shows a state's transitions, guards and the contracts that cover them, and `npx hozu docs machine` and `npx hozu docs contracts` print the topics for your agent.
