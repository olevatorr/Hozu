import { invoke, machine, on, ui } from '@hozu/core'
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
          guard: (item) => item.qty <= MAX_QTY,
          assign: (item) => {
            ctx.pending = item
          },
        }),
        on(AddItem, {
          target: 'error',
          assign: () => {
            ctx.error = `At most ${MAX_QTY} per item`
          },
        }),
        on(RemoveItem, {
          target: 'removing',
          assign: (item) => {
            ctx.pending.sku = item.sku
          },
        }),
        on(Checkout, { target: 'checkingOut' }),
        on(SetQuantity, {
          target: 'idle',
          guard: (q) => q.qty! >= 1 && q.qty! <= MAX_QTY,
          assign: (q) => {
            ctx.pending.qty = q.qty!
          },
        }),
      ],
    },
    adding: {
      invoke: invoke(addItem, {
        input: ctx.pending,
        done: [{ target: 'idle' }],
        failed: {
          OutOfStock: [
            {
              target: 'error',
              assign: () => {
                ctx.error = 'Out of stock'
              },
            },
          ],
          Unexpected: [
            {
              target: 'error',
              assign: (error) => {
                ctx.error = error.message
              },
            },
          ],
        },
      }),
    },
    removing: {
      invoke: invoke(removeItem, {
        input: { sku: ctx.pending.sku },
        done: [{ target: 'idle' }],
        failed: {
          Unexpected: [
            {
              target: 'error',
              assign: (error) => {
                ctx.error = error.message
              },
            },
          ],
        },
      }),
    },
    checkingOut: {
      invoke: invoke(checkout, {
        input: {},
        done: [
          {
            target: 'placed',
            assign: (order) => {
              ctx.orderId = order.orderId
            },
            navigate: () => ui.link(orderPlaced, null),
          },
        ],
        failed: {
          PaymentDeclined: [
            {
              target: 'error',
              assign: (declined) => {
                ctx.error = declined.reason
              },
            },
          ],
          Unexpected: [
            {
              target: 'error',
              assign: (error) => {
                ctx.error = error.message
              },
            },
          ],
        },
      }),
    },
    error: {
      on: [
        on(Dismiss, {
          target: 'idle',
          assign: () => {
            ctx.error = null
          },
        }),
      ],
      after: [
        {
          ms: 5000,
          target: 'idle',
          assign: () => {
            ctx.error = null
          },
        },
      ],
    },
    placed: { final: true },
  }),
})
