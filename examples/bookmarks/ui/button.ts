import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-flex items-center justify-center gap-2 rounded px-4 py-2 font-medium',
  variants: {
    tone: {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
      quiet: 'px-2 py-1 text-sm text-slate-600 hover:text-slate-900',
    },
  },
  defaultVariants: { tone: 'primary' },
})

export const Button = ui.component({
  tag: 'button',
  styles,
  props: z.object({ type: z.enum(['button', 'submit']).default('button') }),
  children: true,
  events: ['press'],
  render: ({ props, children, on }) => ui.button({ type: props.type, on: { click: on.press } }, children),
})
