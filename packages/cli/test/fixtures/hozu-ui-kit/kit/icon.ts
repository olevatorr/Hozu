import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'shrink-0 fill-none stroke-current',
  variants: { size: { sm: 'size-4', md: 'size-5' } },
  defaultVariants: { size: 'sm' },
})

export const Icon = ui.component({
  tag: 'svg',
  styles,
  props: z.object({ d: z.string() }),
  render: ({ props }) =>
    ui.svg({ viewBox: '0 0 24 24', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [
      ui.path({ d: props.d }),
    ]),
})
