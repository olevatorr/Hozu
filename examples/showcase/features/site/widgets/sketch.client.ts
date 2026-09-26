import { implement } from '@hozu/core/widget'
import p5 from 'p5'
import type { Sketch } from '../widgets.ts'

export default implement<typeof Sketch>(({ el, props }) => {
  let hue = props.hue
  el.replaceChildren()
  const instance = new p5((p) => {
    p.setup = () => {
      const { width, height } = el.getBoundingClientRect()
      p.createCanvas(width, height)
      p.colorMode(p.HSB, 360, 100, 100, 1)
      p.noStroke()
    }
    p.draw = () => {
      p.background(hue, 20, 12, 0.08)
      const t = p.millis() / 1000
      for (let i = 0; i < 6; i++) {
        p.fill((hue + i * 18) % 360, 70, 95, 0.6)
        p.circle(
          p.width / 2 + Math.cos(t + i) * p.width * 0.3,
          p.height / 2 + Math.sin(t * 1.3 + i) * p.height * 0.3,
          18,
        )
      }
    }
  }, el)
  return {
    update(next) {
      hue = next.hue
    },
    destroy: () => instance.remove(),
  }
})
