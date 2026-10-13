import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'min-w-0 rounded-card border border-line bg-surface text-ink',
    header: 'flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3',
    title: 'text-sm font-semibold',
    description: 'mt-0.5 text-xs text-ink-muted',
    body: '',
    footer: 'border-t border-line px-5 py-3',
  },
  variants: { pad: { normal: { body: 'p-5' }, none: {} } },
  defaultVariants: { pad: 'normal' },
})

export const Card = ui.component({
  tag: 'section',
  styles,
  props: z.object({ title: z.string().default(''), description: z.string().default('') }),
  slots: ['actions', 'footer'],
  children: true,
  render: ({ props, slots, children, classes }) =>
    ui.section({}, [
      props.title !== '' &&
        ui.header({ class: classes.header }, [
          ui.div({}, [
            ui.h2({ class: classes.title }, [props.title]),
            props.description !== '' && ui.p({ class: classes.description }, [props.description]),
          ]),
          slots.actions,
        ]),
      ui.div({ class: classes.body }, children),
      slots.footer,
    ]),
})
