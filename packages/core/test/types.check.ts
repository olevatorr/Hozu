import { contract, event, invoke, machine, mutation, on, op, ui } from '@tenon/core'
import { z } from 'zod'

const Item = z.object({ sku: z.string(), qty: z.number() })
const Add = event({ payload: Item })
const save = mutation({
  input: Item,
  output: z.object({ id: z.string() }),
  errors: { Busy: z.object({}) },
  invalidates: () => [],
})
const Context = z.object({ items: z.array(Item), note: z.string().nullable() })

export const ok = machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Add, { target: 'saving', assign: (item) => [op.append(ctx.items, item)] })] },
    saving: {
      invoke: invoke(save, {
        input: { sku: 'a', qty: 1 },
        done: [{ target: 'idle', assign: (r) => [op.set(ctx.note, r.id)] }],
        failed: {
          Busy: [{ target: 'idle' }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.note, e.message)] }],
        },
      }),
    },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: () => ({
    // @ts-expect-error typo in a transition target
    idle: { on: [on(Add, { target: 'idel' })] },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  // @ts-expect-error typo in the initial state
  initial: 'idel',
  states: () => ({ idle: {} }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    // @ts-expect-error misspelled payload field
    idle: { on: [on(Add, { target: 'idle', assign: (item) => [op.set(ctx.note, item.skuu)] })] },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    // @ts-expect-error wrong value type for a context path
    idle: { on: [on(Add, { target: 'idle', assign: (item) => [op.set(ctx.note, item.qty)] })] },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: () => ({
    idle: {
      // @ts-expect-error an invalid failed map also widens the invoke targets
      invoke: invoke(save, {
        input: { sku: 'a', qty: 1 },
        done: [{ target: 'idle' }],
        // @ts-expect-error declared error Busy is not handled
        failed: { Unexpected: [{ target: 'idle' }] },
      }),
    },
  }),
})

machine({
  context: Context,
  initialContext: { items: [], note: null },
  initial: 'idle',
  states: () => ({
    idle: {
      // @ts-expect-error typo in a failed target
      invoke: invoke(save, {
        input: { sku: 'a', qty: 1 },
        done: [{ target: 'idle' }],
        failed: { Busy: [{ target: 'idle' }], Unexpected: [{ target: 'eror' }] },
      }),
    },
  }),
})

ui.view({
  machine: ok,
  render: ({ ctx, when }) =>
    ui.div({}, [
      // @ts-expect-error unknown state in when()
      when(['saving', 'done'], []),
      // @ts-expect-error payload does not match the event schema
      ui.button({ on: { click: ui.send(Add, { sku: 'a' }) } }, ['Add']),
      // @ts-expect-error each key must be a property of the items
      ui.each(ctx.items, 'id', (item) => ui.span({}, [item.sku])),
      // @ts-expect-error unknown context path
      ctx.missing,
    ]),
})

contract(ok, {
  // @ts-expect-error unknown state in a contract
  given: { state: 'waiting', context: { items: [], note: null } },
  when: [],
  expect: { state: 'idle', context: null, effects: null },
})
