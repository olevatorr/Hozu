import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: '@container rounded-card border border-line bg-surface p-4',
    label: 'text-sm text-ink-muted',
    value: 'mt-1 text-metric font-semibold tabular-nums text-ink',
    foot: 'mt-2 flex items-center gap-2 text-sm text-ink-muted',
    delta: 'font-medium tabular-nums data-[trend=up]:text-up data-[trend=down]:text-down',
  },
})

export const Metric = ui.component({
  tag: 'section',
  styles,
  props: z.object({
    label: z.string(),
    value: z.string(),
    delta: z.string().default(''),
    trend: z.enum(['up', 'down', 'flat']).default('flat'),
    period: z.string().default(''),
  }),
  slots: ['spark'],
  render: ({ props, slots, classes }) =>
    ui.section({ 'aria-label': props.label }, [
      ui.p({ class: classes.label }, [props.label]),
      ui.p({ class: classes.value }, [props.value]),
      ui.p({ class: classes.foot }, [
        props.delta !== '' && ui.span({ class: classes.delta, 'data-trend': props.trend }, [props.delta]),
        props.period,
      ]),
      slots.spark,
    ]),
})
