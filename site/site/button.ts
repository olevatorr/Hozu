import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-block border-4 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide transition-colors duration-150',
  variants: {
    intent: {
      solid: 'border-ink bg-ink text-paper hover:bg-paper hover:text-ink',
      outline: 'border-ink text-ink hover:bg-ink hover:text-paper',
      light: 'border-paper bg-paper text-ink hover:bg-transparent hover:text-paper',
      lightOutline: 'border-paper text-paper hover:bg-paper hover:text-ink',
    },
  },
  defaultVariants: { intent: 'solid' },
})
export const Button = ui.component({
  tag: 'a',
  styles,
  props: z.object({ href: z.string() }),
  children: true,
  render: ({ props, children }) => ui.a({ href: props.href, 'data-button': '' }, children),
})
