import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-block px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5',
  variants: {
    intent: {
      solid: 'bg-ink text-paper shadow-[6px_6px_0_var(--color-red)] hover:bg-red hover:text-ink',
      outline: 'border-4 border-ink text-ink hover:bg-ink hover:text-paper',
      light: 'bg-paper text-ink shadow-[6px_6px_0_var(--color-red)] hover:bg-red',
      lightOutline: 'border-4 border-paper text-paper hover:bg-paper hover:text-ink',
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
