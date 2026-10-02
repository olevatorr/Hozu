import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: { base: 'flex-1 space-y-1', label: 'sr-only', error: 'text-sm text-rose-600' },
})

export const Field = ui.component({
  tag: 'div',
  styles,
  props: z.object({ for: z.string(), label: z.string(), error: z.string().nullable(), errorId: z.string() }),
  slots: ['control'],
  render: ({ props, slots, classes }) =>
    ui.div({}, [
      ui.label({ for: props.for, class: classes.label }, [props.label]),
      slots.control,
      ui.p({ id: props.errorId, class: classes.error }, [props.error]),
    ]),
})
