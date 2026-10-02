import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm aria-[invalid=true]:border-brand',
})

export const Input = ui.component({
  tag: 'input',
  styles,
  props: z.object({
    id: z.string(),
    name: z.string(),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    invalid: z.boolean().optional(),
    describedby: z.string().optional(),
  }),
  events: ['input'],
  render: ({ props, on }) =>
    ui.input({
      id: props.id,
      name: props.name,
      value: props.value,
      placeholder: props.placeholder,
      'aria-invalid': props.invalid,
      'aria-describedby': props.describedby,
      on: { input: on.input },
    }),
})
