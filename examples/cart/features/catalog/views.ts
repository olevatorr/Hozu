import { ui } from '@hozu/core'
import { home, product } from '../../routes.ts'
import { getProduct, listProducts } from './effects.ts'

export const ProductGrid = ui.view({
  render: () =>
    ui.section({ class: 'grid gap-4' }, [
      ui.h2({}, ['Products']),
      ui.query(
        listProducts,
        {},
        {
          ready: (products) =>
            ui.ul({ class: 'grid grid-cols-3 gap-2' }, [
              ui.each(products, 'sku', (item) =>
                ui.li({ class: 'rounded border p-2' }, [
                  ui.a({ href: ui.link(product, { sku: item.sku }) }, [ui.strong({}, [item.name])]),
                  ' — $',
                  item.price,
                ]),
              ),
            ]),
          pending: ui.p({}, ['Loading products…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Catalog unavailable']) },
        },
      ),
    ]),
})

export const ProductDetail = ui.view({
  route: product,
  render: ({ params }) =>
    ui.section({ class: 'grid gap-4' }, [
      ui.a({ href: ui.link(home, null) }, ['All products']),
      ui.query(
        getProduct,
        { sku: params.sku },
        {
          ready: (item) => ui.h2({}, [item.name, ' — $', item.price]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['No such product']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Catalog unavailable']),
          },
        },
      ),
    ]),
})
