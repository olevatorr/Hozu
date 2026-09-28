import { implement } from '@hozu/core/widget'
import gsap from 'gsap'
import type { FadeIn } from './widgets.ts'

export default implement<typeof FadeIn>(({ el }) => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const play = () => {
    if (!reduced) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 })
  }
  play()
  return { update: play, destroy: () => gsap.killTweensOf(el) }
})
