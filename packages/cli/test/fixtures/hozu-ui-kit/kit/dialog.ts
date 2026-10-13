import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'm-auto rounded-card border border-line bg-surface-raised p-0 text-ink shadow-overlay backdrop:bg-scrim opacity-0 transition-[opacity,display,overlay] transition-discrete open:opacity-100 starting:open:opacity-0',
    head: 'border-b border-line px-6 py-4',
    title: 'display text-lg',
    description: 'mt-1 text-sm text-ink-muted',
    body: 'grid gap-4 px-6 py-5',
    foot: 'flex justify-end gap-2 border-t border-line bg-surface-sunken px-6 py-3',
  },
  variants: {
    size: {
      sm: { base: 'w-[min(24rem,calc(100vw-2rem))]' },
      md: { base: 'w-[min(32rem,calc(100vw-2rem))]' },
      lg: { base: 'w-[min(48rem,calc(100vw-2rem))]' },
    },
  },
  defaultVariants: { size: 'md' },
})

export const Dialog = ui.component({
  tag: 'dialog',
  styles,
  props: z.object({ id: z.string(), title: z.string(), description: z.string().default(''), open: z.boolean().optional() }),
  slots: ['footer'],
  children: true,
  events: ['close'],
  render: ({ props, slots, children, classes, on }) =>
    ui.dialog({ id: props.id, open: props.open, closedby: 'any', 'aria-labelledby': `${props.id}-title`, on: { close: on.close } }, [
      ui.header({ class: classes.head }, [
        ui.h2({ id: `${props.id}-title`, class: classes.title }, [props.title]),
        props.description !== '' && ui.p({ class: classes.description }, [props.description]),
      ]),
      ui.div({ class: classes.body }, children),
      ui.footer({ class: classes.foot }, [slots.footer]),
    ]),
})
