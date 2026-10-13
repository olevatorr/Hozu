import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const buttonStyles = tv({
  base: 'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-wait aria-busy:opacity-70',
  variants: {
    intent: {
      primary: 'bg-accent text-on-accent shadow-control hover:bg-accent/90',
      secondary: 'border border-line-strong bg-surface text-ink shadow-control hover:bg-surface-sunken',
      quiet: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
      destructive: 'bg-danger text-on-danger shadow-control hover:bg-danger/90',
    },
    size: { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm', icon: 'size-8 text-sm' },
  },
  defaultVariants: { intent: 'secondary', size: 'md' },
})

export const Button = ui.component({
  tag: 'button',
  styles: buttonStyles,
  props: z.object({
    type: z.enum(['button', 'submit']).default('button'),
    name: z.string().optional(),
    value: z.string().optional(),
    disabled: z.boolean().default(false),
    busy: z.boolean().default(false),
    label: z.string().optional(),
    commandfor: z.string().optional(),
    command: z.enum(['show-modal', 'close', 'request-close', 'toggle-popover', 'show-popover', 'hide-popover']).optional(),
  }),
  slots: ['icon'],
  children: true,
  events: ['press'],
  render: ({ props, slots, children, on }) =>
    ui.button(
      {
        type: props.type,
        name: props.name,
        value: props.value,
        disabled: props.disabled,
        'aria-busy': props.busy,
        'aria-label': props.label,
        commandfor: props.commandfor,
        command: props.command,
        on: { click: on.press },
      },
      [slots.icon, ...children],
    ),
})

export const LinkButton = ui.component({
  tag: 'a',
  styles: buttonStyles,
  props: z.object({ href: z.string() }),
  slots: ['icon'],
  children: true,
  render: ({ props, slots, children }) => ui.a({ href: props.href }, [slots.icon, ...children]),
})
