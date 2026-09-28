import { implement } from '@hozu/core/widget'
import gsap from 'gsap'
import type { Counter } from './widgets.ts'

export default implement<typeof Counter>(({ el, props }) => {
  const state = { n: props.value }
  el.textContent = String(props.value)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  return {
    update(next) {
      gsap.killTweensOf(state)
      if (reduced) {
        state.n = next.value
        el.textContent = String(next.value)
        return
      }
      gsap.to(state, {
        n: next.value,
        duration: 0.6,
        ease: 'power1.out',
        onUpdate: () => {
          el.textContent = String(Math.round(state.n))
        },
        onComplete: () => {
          el.textContent = String(next.value)
        },
      })
    },
    destroy: () => gsap.killTweensOf(state),
  }
})
