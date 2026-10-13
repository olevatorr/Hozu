import { ui } from '@hozu/core'
import { z } from 'zod'
import { x } from './icons/lucide.ts'
import { tv } from './tv.ts'

const emptyStyles = tv({
  slots: {
    base: 'flex flex-col items-center justify-center gap-2 text-center',
    title: 'text-sm font-semibold text-ink',
    body: 'max-w-sm text-sm text-ink-muted text-pretty',
    action: 'mt-3',
  },
  variants: { size: { inline: { base: 'px-6 py-12' }, page: { base: 'px-6 py-24', title: 'display text-2xl', body: 'text-base' } } },
  defaultVariants: { size: 'inline' },
})

export const EmptyState = ui.component({
  tag: 'div',
  styles: emptyStyles,
  props: z.object({ title: z.string(), body: z.string().default('') }),
  slots: ['action'],
  render: ({ props, slots, classes }) =>
    ui.div({}, [
      ui.p({ class: classes.title }, [props.title]),
      props.body !== '' && ui.p({ class: classes.body }, [props.body]),
      ui.div({ class: classes.action }, [slots.action]),
    ]),
})

const problemStyles = tv({
  slots: {
    base: 'flex flex-col items-center gap-2 px-6 py-12 text-center',
    title: 'text-sm font-semibold text-danger-text',
    body: 'max-w-sm text-sm text-ink-muted',
  },
})

export const Problem = ui.component({
  tag: 'div',
  styles: problemStyles,
  props: z.object({ title: z.string(), body: z.string().default('') }),
  slots: ['action'],
  render: ({ props, slots, classes }) =>
    ui.div({ role: 'alert' }, [
      ui.p({ class: classes.title }, [props.title]),
      props.body !== '' && ui.p({ class: classes.body }, [props.body]),
      slots.action,
    ]),
})

const noticeStyles = tv({
  slots: {
    base: 'flex max-w-sm items-start gap-3 rounded-card border border-line bg-surface-raised px-4 py-3 text-sm text-ink shadow-overlay data-[tone=danger]:border-danger data-[tone=danger]:text-danger-text',
    message: 'flex-1',
    close: 'cursor-pointer rounded-control p-0.5 text-ink-muted hover:text-ink',
    closeIcon: 'size-4 fill-none stroke-current',
  },
  variants: { placement: { inline: {}, toast: { base: 'fixed right-4 bottom-4 z-50' } } },
  defaultVariants: { placement: 'toast' },
})

export const Notice = ui.component({
  tag: 'div',
  styles: noticeStyles,
  props: z.object({ message: z.string(), tone: z.enum(['info', 'danger']).default('info'), closeLabel: z.string().default('Dismiss') }),
  events: ['dismiss'],
  render: ({ props, on, classes }) =>
    ui.div({ role: 'status', 'aria-live': 'polite', 'data-tone': props.tone }, [
      ui.p({ class: classes.message }, [props.message]),
      ui.button({ type: 'button', class: classes.close, 'aria-label': props.closeLabel, keys: ['Escape'], on: { click: on.dismiss } }, [
        ui.svg({ class: classes.closeIcon, viewBox: '0 0 24 24', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [ui.path({ d: x })]),
      ]),
    ]),
})
