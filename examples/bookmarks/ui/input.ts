import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({ base: 'w-full rounded border px-3 py-2 aria-invalid:border-rose-500' })

export const Input = ui.component({
  tag: 'input',
  styles,
  props: z.object({
    id: z.string(),
    name: z.string(),
    value: z.string(),
    required: z.boolean().default(false),
    minlength: z.number().optional(),
    maxlength: z.number().optional(),
    invalid: z.boolean().default(false),
    describedby: z.string().optional(),
  }),
  events: ['input'],
  render: ({ props, on }) =>
    ui.input({
      id: props.id,
      name: props.name,
      value: props.value,
      required: props.required,
      minlength: props.minlength,
      maxlength: props.maxlength,
      'aria-invalid': props.invalid,
      'aria-describedby': props.describedby,
      on: { input: on.input },
    }),
})
