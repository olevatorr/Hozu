import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
  variants: {
    tone: {
      primary: 'bg-ink text-paper hover:bg-black',
      secondary: 'border border-slate-300 bg-white text-ink hover:bg-slate-50',
      danger: 'bg-brand text-white hover:bg-red-600',
      ghost: 'text-slate-600 hover:text-ink',
    },
    size: { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm' },
  },
  defaultVariants: { tone: 'primary', size: 'md' },
})

export const Button = ui.component({
  tag: 'button',
  styles,
  props: z.object({ type: z.enum(['button', 'submit']).default('button') }),
  children: true,
  events: ['press'],
  render: ({ props, children, on }) => ui.button({ type: props.type, on: { click: on.press } }, children),
})
