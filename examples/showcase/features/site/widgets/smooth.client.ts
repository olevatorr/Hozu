import { implement } from '@tenon/core/widget'
import Lenis from 'lenis'
import type { Smooth } from '../widgets.ts'

export default implement<typeof Smooth>(({ signal }) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
  const lenis = new Lenis({ lerp: 0.12 })
  const frame = (time: number) => {
    if (signal.aborted) return
    lenis.raf(time)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return { destroy: () => lenis.destroy() }
})
