import { ui } from '@tenon/core'
import { listProducts } from '../catalog/effects.ts'
import { cartTotal, getCart } from './effects.ts'
import { AddItem, Checkout, Dismiss, RemoveItem } from './events.ts'
import { cartMachine } from './machine.ts'

export const CartPanel = ui.view({
  machine: cartMachine,
  route: null,
  render: ({ ctx, when }) =>
    ui.section({ class: 'grid gap-6' }, [
      ui.h2({}, ['Cart']),
      ui.query(
        getCart,
        {},
        {
          ready: (cart) =>
            ui.div({}, [
              ui.ul({ class: 'divide-y' }, [
                ui.each(cart.items, 'sku', (item) =>
                  ui.li({ class: 'flex justify-between' }, [
                    item.name,
                    ' × ',
                    item.qty,
                    when(
                      ['idle'],
                      [
                        ui.button({ type: 'button', on: { click: ui.send(RemoveItem, { sku: item.sku }) } }, [
                          'Remove',
                        ]),
                      ],
                    ),
                  ]),
                ),
              ]),
              ui.p({ class: 'font-bold' }, ['Total: $', cartTotal(cart.items)]),
            ]),
          pending: ui.p({}, ['Loading cart…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Could not load your cart']) },
        },
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
                    ['idle'],
                    [
                      ui.button(
                        { type: 'button', on: { click: ui.send(AddItem, { sku: product.sku, qty: 1 }) } },
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
          ui.button({ type: 'button', on: { click: ui.send(Dismiss, {}) } }, ['Dismiss']),
        ],
      ),
      when(['idle'], [ui.button({ type: 'button', on: { click: ui.send(Checkout, {}) } }, ['Checkout'])]),
      when(['placed'], [ui.p({}, ['Order ', ctx.orderId, ' placed'])]),
    ]),
})
