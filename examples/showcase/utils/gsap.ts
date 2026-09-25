import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.8, ease: 'power3.out' })

export const reveal = { y: 32, opacity: 0, stagger: 0.08 } as const
export const revealTrigger = { start: 'top 85%', once: true } as const

export { gsap, ScrollTrigger }
