import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  variants: {
    tone: {
      primary: 'rounded bg-indigo-600 px-4 py-2 text-white',
      subtle: 'text-sm text-slate-600 underline',
      plain: 'underline',
    },
  },
  defaultVariants: { tone: 'primary' },
})

export const Button = ui.component({
  tag: 'button',
  styles,
  props: z.object({
    type: z.enum(['button', 'submit']).default('button'),
    name: z.string().optional(),
    value: z.string().optional(),
  }),
  children: true,
  events: ['press'],
  render: ({ props, children, on }) =>
    ui.button({ type: props.type, name: props.name, value: props.value, on: { click: on.press } }, children),
})
