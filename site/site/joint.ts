import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const poster = ui.asset(new URL('../assets/joint-poster.webp', import.meta.url))
const model = ui.asset(new URL('../assets/joint.glb', import.meta.url))

export const Joint = ui.component({
  tag: 'div',
  styles: tv({ base: 'relative aspect-square w-full max-w-[34rem] cursor-grab touch-pan-y select-none' }),
  props: z.object({ split: z.boolean() }),
  client: new URL('./joint.client.ts', import.meta.url),
  load: 'visible',
  render: () =>
    ui.div({}, [
      ui.img({
        src: poster,
        'data-model': model,
        width: 900,
        height: 900,
        alt: 'A tenon joint: two posts, a beam with two tenons and two red pegs',
        class: 'h-full w-full',
      }),
    ]),
})
