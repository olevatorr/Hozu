import { ui } from '@hozu/core'
import { PublicEnv } from '../../env.ts'
import { listProducts } from '../catalog/effects.ts'
import { cartTotal, getCart } from './effects.ts'
import { AddItem, Checkout, Dismiss, RemoveItem, SetQuantity } from './events.ts'
import { cartMachine, MAX_QTY } from './machine.ts'

export const CartPanel = ui.view({
  machine: cartMachine,
  render: ({ ctx, when, is }) =>
    ui.section({ class: 'grid gap-6' }, [
      ui.h2({}, ['Cart']),
      ui.query(
        getCart,
        {},
        {
          ready: (cart) =>
            ui.div({}, [
              ui.ul({ class: 'divide-y' }, [
                ui.each(
                  cart.items,
                  'sku',
                  (item) =>
                    ui.li({ class: 'flex justify-between' }, [
                      item.name,
                      ' × ',
                      item.qty,
                      when(
                        ['idle', 'adding', 'removing', 'checkingOut'],
                        [
                          ui.button(
                            {
                              type: 'button',
                              disabled: !is(['idle']),
                              on: { click: ui.send(RemoveItem, { sku: item.sku }) },
                            },
                            ['Remove'],
                          ),
                        ],
                      ),
                    ]),
                  'list',
                ),
              ]),
              ui.p({ class: 'font-bold' }, ['Total: $', cartTotal(cart.items)]),
            ]),
          pending: ui.p({}, ['Loading cart…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Could not load your cart']) },
        },
      ),
      when(
        ['idle', 'adding', 'removing', 'checkingOut'],
        [
          ui.label(
            {
              class: 'flex items-center gap-2',
              toggle: { 'font-semibold text-red-600': ctx.pending.qty >= MAX_QTY },
            },
            [
              'Quantity',
              ui.input({
                type: 'number',
                name: 'qty',
                min: 1,
                max: MAX_QTY,
                value: ctx.pending.qty,
                disabled: !is(['idle']),
                on: { input: ui.send(SetQuantity, { qty: ui.dom.valueAsNumber }) },
              }),
              ui.span({ class: 'h-1 w-24 rounded bg-gray-200' }, [
                ui.span(
                  {
                    class: 'block h-1 w-[calc(var(--qty)*10%)] rounded bg-blue-600 transition-all',
                    vars: { '--qty': ctx.pending.qty },
                  },
                  [],
                ),
              ]),
            ],
          ),
        ],
      ),
      ui.query(
        listProducts,
        {},
        {
          ready: (products) =>
            ui.ul({ class: 'grid grid-cols-2 gap-2' }, [
              ui.each(products, 'sku', (product) =>
                ui.li({}, [
                  product.name,
                  when(
                    ['idle', 'adding', 'removing', 'checkingOut'],
                    [
                      ui.button(
                        {
                          type: 'button',
                          disabled: !is(['idle']),
                          on: { click: ui.send(AddItem, { sku: product.sku, qty: ctx.pending.qty }) },
                        },
                        ['Add'],
                      ),
                    ],
                  ),
                ]),
              ),
            ]),
          pending: null,
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Catalog unavailable']) },
        },
      ),
      when(['adding', 'removing', 'checkingOut'], [ui.p({ 'aria-live': 'polite' }, ['Saving…'])]),
      when(
        ['error'],
        [
          ui.p({ role: 'alert' }, [ctx.error]),
          ui.p({ class: 'text-sm text-gray-500' }, ['Need help? ', ui.env(PublicEnv).SUPPORT_EMAIL]),
          ui.button({ type: 'button', on: { click: ui.send(Dismiss, {}) } }, ['Dismiss']),
        ],
        'fade',
      ),
      when(
        ['idle', 'adding', 'removing', 'checkingOut'],
        [
          ui.button({ type: 'button', disabled: !is(['idle']), on: { click: ui.send(Checkout, {}) } }, [
            'Checkout',
          ]),
        ],
      ),
      when(['placed'], [ui.p({}, ['Order ', ctx.orderId, ' placed'])]),
    ]),
})
