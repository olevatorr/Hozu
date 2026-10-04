import { ui } from '@hozu/core'
import { Add, cart, listProducts } from './model.ts'

export const Page = ui.view({
  machine: cart,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.h1({}, ['Products']),
      ui.query(
        listProducts,
        {},
        {
          ready: (list) =>
            ui.ul({}, [
              ui.each(list, 'sku', (p) =>
                ui.li({}, [
                  ui.strong({}, [p.name]),
                  ' — $',
                  p.price,
                  ui.button({ type: 'button', on: { click: ui.send(Add, { sku: p.sku }) } }, ['Add']),
                ]),
              ),
            ]),
          failed: { Unexpected: () => ui.p({}, ['error']) },
        },
      ),
      ui.p({}, ['Cart: ', ctx.count, ' items']),
    ]),
})
