import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'block w-full rounded-control border border-line-strong bg-surface px-3 text-ink shadow-control placeholder:text-ink-faint focus:border-focus focus:outline-2 focus:outline-focus/25 disabled:bg-surface-sunken disabled:text-ink-muted aria-invalid:border-danger user-invalid:border-danger',
  variants: { size: { sm: 'h-8 text-xs', md: 'h-9 text-sm', lg: 'h-11 text-base' } },
  defaultVariants: { size: 'md' },
})

export const Input = ui.component({
  tag: 'input',
  styles,
  props: z.object({
    id: z.string().optional(),
    name: z.string(),
    value: z.string().default(''),
    type: z.enum(['text', 'email', 'password', 'number', 'search', 'url', 'tel', 'date']).default('text'),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    placeholder: z.string().optional(),
    autocomplete: z.string().optional(),
    minlength: z.number().optional(),
    maxlength: z.number().optional(),
    invalid: z.boolean().default(false),
    describedby: z.string().optional(),
    label: z.string().optional(),
  }),
  events: ['input'],
  render: ({ props, on }) =>
    ui.input({
      id: props.id,
      name: props.name,
      value: props.value,
      type: props.type,
      required: props.required,
      disabled: props.disabled,
      placeholder: props.placeholder,
      autocomplete: props.autocomplete,
      minlength: props.minlength,
      maxlength: props.maxlength,
      'aria-invalid': props.invalid,
      'aria-describedby': props.describedby,
      'aria-label': props.label,
      on: { input: on.input },
    }),
})
