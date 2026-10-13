import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'grid gap-1.5',
    label: 'text-sm font-medium text-ink',
    hint: 'text-xs text-ink-muted',
    error: 'text-xs font-medium text-danger-text empty:hidden',
  },
})

export const Field = ui.component({
  tag: 'div',
  styles,
  props: z.object({
    for: z.string(),
    label: z.string(),
    hint: z.string().default(''),
    error: z.string().nullable().default(null),
    errorId: z.string(),
  }),
  slots: ['control'],
  render: ({ props, slots, classes }) =>
    ui.div({}, [
      ui.label({ for: props.for, class: classes.label }, [props.label]),
      slots.control,
      props.hint !== '' && ui.p({ class: classes.hint }, [props.hint]),
      ui.p({ id: props.errorId, class: classes.error, 'aria-live': 'polite' }, [props.error ?? '']),
    ]),
})
