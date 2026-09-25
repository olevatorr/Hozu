import { defineComponent, h, type PropType, ref } from 'vue'
import type { Product } from './data.ts'

export const App = defineComponent({
  props: { products: { type: Array as PropType<Product[]>, required: true } },
  setup(props) {
    const count = ref(0)
    return () =>
      h('main', [
        h('h1', 'Products'),
        h(
          'ul',
          props.products.map((p) =>
            h('li', { key: p.sku }, [
              h('strong', p.name),
              ` — $${p.price}`,
              h('button', { type: 'button', onClick: () => count.value++ }, 'Add'),
            ]),
          ),
        ),
        h('p', ['Cart: ', count.value, ' items']),
      ])
  },
})
