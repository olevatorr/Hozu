import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({ base: 'rounded border px-3 py-2' })

export const Input = ui.component({
  tag: 'input',
  styles,
  props: z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.enum(['text', 'search']).optional(),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    autocomplete: z.string().optional(),
    required: z.boolean().optional(),
    minlength: z.number().optional(),
    maxlength: z.number().optional(),
    invalid: z.boolean().optional(),
    describedby: z.string().optional(),
  }),
  events: ['input'],
  render: ({ props, on }) =>
    ui.input({
      id: props.id,
      name: props.name,
      type: props.type,
      required: props.required,
      minlength: props.minlength,
      maxlength: props.maxlength,
      autocomplete: props.autocomplete,
      value: props.value,
      placeholder: props.placeholder,
      'aria-invalid': props.invalid,
      'aria-describedby': props.describedby,
      on: { input: on.input },
    }),
})
