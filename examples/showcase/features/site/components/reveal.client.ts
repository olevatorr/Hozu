import { implement } from '@hozu/core/component'
import { gsap, reveal, revealTrigger } from '../../../utils/gsap.ts'
import type { Reveal } from '../components.ts'

export default implement<typeof Reveal>(({ el }) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
  const context = gsap.context(() => {
    gsap.from(el.querySelectorAll('[data-reveal]'), {
      ...reveal,
      scrollTrigger: { ...revealTrigger, trigger: el },
    })
  }, el)
  return { destroy: () => context.revert() }
})
