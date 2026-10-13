import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const BadgeTone = z.enum(['neutral', 'info', 'success', 'warning', 'danger', 'accent'])

const styles = tv({
  slots: {
    base: 'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-surface-sunken text-ink-muted data-[tone=info]:bg-info-subtle data-[tone=info]:text-info-text data-[tone=success]:bg-success-subtle data-[tone=success]:text-success-text data-[tone=warning]:bg-warning-subtle data-[tone=warning]:text-warning-text data-[tone=danger]:bg-danger-subtle data-[tone=danger]:text-danger-text data-[tone=accent]:bg-accent-subtle data-[tone=accent]:text-accent-text',
    dot: 'size-1.5 rounded-pill bg-current',
  },
  variants: { shape: { pill: { base: 'rounded-pill' }, square: { base: 'rounded-control' } } },
  defaultVariants: { shape: 'pill' },
})

export const Badge = ui.component({
  tag: 'span',
  styles,
  props: z.object({ tone: BadgeTone.default('neutral'), label: z.string() }),
  render: ({ props, classes }) =>
    ui.span({ 'data-tone': props.tone }, [ui.span({ class: classes.dot, 'aria-hidden': 'true' }, []), props.label]),
})
