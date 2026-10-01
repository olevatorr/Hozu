import { implement } from '@hozu/core/component'
import type { Meter } from './meter.ts'

export default implement<typeof Meter>(({ el, props, emit, signal }) => {
  let value = props.value
  el.textContent = `v=${value}`
  el.addEventListener('click', () => emit('picked', { n: value + 1 }), { signal })
  return {
    update(next) {
      value = next.value
      el.textContent = `v=${value}`
    },
    destroy() {
      el.dataset.destroyed = 'yes'
    },
  }
})
