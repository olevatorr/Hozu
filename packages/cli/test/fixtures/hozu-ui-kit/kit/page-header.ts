import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'flex flex-wrap items-end justify-between gap-4',
    title: 'display text-ink text-balance',
    description: 'mt-1 max-w-2xl text-ink-muted text-pretty',
    actions: 'flex items-center gap-2',
  },
  variants: {
    size: {
      app: { title: 'text-2xl', description: 'text-sm' },
      display: { title: 'mt-3 text-display', description: 'mt-3 text-lg' },
    },
  },
  defaultVariants: { size: 'app' },
})

export const PageHeader = ui.component({
  tag: 'header',
  styles,
  props: z.object({ title: z.string(), description: z.string().default('') }),
  slots: ['eyebrow', 'actions'],
  render: ({ props, slots, classes }) =>
    ui.header({}, [
      ui.div({}, [
        slots.eyebrow,
        ui.h1({ class: classes.title }, [props.title]),
        props.description !== '' && ui.p({ class: classes.description }, [props.description]),
      ]),
      ui.div({ class: classes.actions }, [slots.actions]),
    ]),
})
