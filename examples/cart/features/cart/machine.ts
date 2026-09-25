import { invoke, machine, on, op } from '@tenon/core'
import { orderPlaced } from '../../routes.ts'
import { addItem, checkout, removeItem } from './effects.ts'
import { AddItem, Checkout, Dismiss, RemoveItem, SetQuantity } from './events.ts'
import { Context } from './schemas.ts'

export const MAX_QTY = 10

export const cartMachine = machine({
  context: Context,
  initialContext: { pending: { sku: '', qty: 1 }, error: null, orderId: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(AddItem, {
          target: 'adding',
          guard: (item) => op.lte(item.qty, MAX_QTY),
          assign: (item) => [op.set(ctx.pending, item)],
        }),
        on(AddItem, { target: 'error', assign: () => [op.set(ctx.error, `At most ${MAX_QTY} per item`)] }),
        on(RemoveItem, { target: 'removing', assign: (item) => [op.set(ctx.pending.sku, item.sku)] }),
        on(Checkout, { target: 'checkingOut' }),
        on(SetQuantity, {
          target: 'idle',
          guard: (q) => op.and(op.gte(q.qty, 1), op.lte(q.qty, MAX_QTY)),
          assign: (q) => [op.set(ctx.pending.qty, q.qty)],
        }),
      ],
    },
    adding: {
      invoke: invoke(addItem, {
        input: ctx.pending,
        done: [{ target: 'idle' }],
        failed: {
          OutOfStock: [{ target: 'error', assign: () => [op.set(ctx.error, 'Out of stock')] }],
          Unexpected: [{ target: 'error', assign: (error) => [op.set(ctx.error, error.message)] }],
        },
      }),
    },
    removing: {
      invoke: invoke(removeItem, {
        input: { sku: ctx.pending.sku },
        done: [{ target: 'idle' }],
        failed: { Unexpected: [{ target: 'error', assign: (error) => [op.set(ctx.error, error.message)] }] },
      }),
    },
    checkingOut: {
      invoke: invoke(checkout, {
        input: {},
        done: [
          {
            target: 'placed',
            assign: (order) => [op.set(ctx.orderId, order.orderId)],
            navigate: orderPlaced,
          },
        ],
        failed: {
          PaymentDeclined: [{ target: 'error', assign: (declined) => [op.set(ctx.error, declined.reason)] }],
          Unexpected: [{ target: 'error', assign: (error) => [op.set(ctx.error, error.message)] }],
        },
      }),
    },
    error: {
      on: [on(Dismiss, { target: 'idle', assign: () => [op.set(ctx.error, null)] })],
      after: [{ ms: 5000, target: 'idle', assign: () => [op.set(ctx.error, null)] }],
    },
    placed: { final: true },
  }),
})
