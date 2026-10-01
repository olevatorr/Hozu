import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-block px-4 py-3 text-sm font-extrabold uppercase tracking-wide',
  variants: {
    intent: {
      solid: 'bg-ink text-paper shadow-[6px_6px_0_var(--color-red)]',
      outline: 'border-4 border-ink text-ink',
    },
  },
  defaultVariants: { intent: 'solid' },
})
export const Button = ui.component({
  tag: 'a',
  styles,
  props: z.object({ href: z.string() }),
  children: true,
  render: ({ props, children }) => ui.a({ href: props.href }, children),
})
