import { ui } from '@tenon/core'
import { listProducts } from './effects.ts'

export const ProductGrid = ui.view({
  machine: null,
  render: () =>
    ui.section({ class: 'grid gap-4' }, [
      ui.h2({}, ['Products']),
      ui.query(
        listProducts,
        {},
        {
          ready: (products) =>
            ui.ul({ class: 'grid grid-cols-3 gap-2' }, [
              ui.each(products, 'sku', (product) =>
                ui.li({ class: 'rounded border p-2' }, [
                  ui.strong({}, [product.name]),
                  ' — $',
                  product.price,
                ]),
              ),
            ]),
          pending: ui.p({}, ['Loading products…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Catalog unavailable']) },
        },
      ),
    ]),
})
