import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const navLinkStyles = tv({
  slots: {
    base: 'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-focus',
    count: 'rounded-pill bg-surface-sunken px-1.5 text-[0.6875rem] font-semibold tabular-nums text-ink-muted',
  },
  variants: {
    look: {
      tab: { base: 'border-b-2 border-transparent px-3 py-2.5 font-medium text-ink-muted hover:text-ink aria-[current]:border-accent aria-[current]:text-ink' },
      pill: { base: 'rounded-pill border border-line px-4 py-2 text-ink hover:border-line-strong aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-canvas' },
      list: { base: 'w-full rounded-control px-3 py-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink aria-[current]:bg-ink aria-[current]:text-canvas' },
      page: { base: 'size-10 justify-center rounded-pill border border-line hover:border-line-strong aria-[current]:bg-ink aria-[current]:text-canvas' },
    },
  },
  defaultVariants: { look: 'tab' },
})

export const NavLink = ui.component({
  tag: 'a',
  styles: navLinkStyles,
  props: z.object({ href: z.string(), current: z.boolean().default(false), count: z.number().nullable().default(null), rel: z.enum(['prev', 'next']).optional() }),
  children: true,
  render: ({ props, children, classes }) =>
    ui.a({ href: props.href, 'aria-current': props.current, rel: props.rel }, [
      ...children,
      props.count !== null && ui.span({ class: classes.count }, [props.count]),
    ]),
})

const barStyles = tv({
  base: 'flex gap-1 overflow-x-auto',
  variants: { look: { tabs: 'shadow-[inset_0_-1px_0_var(--color-line)]', plain: 'flex-wrap gap-2' } },
  defaultVariants: { look: 'tabs' },
})

export const NavBar = ui.component({
  tag: 'nav',
  styles: barStyles,
  props: z.object({ label: z.string() }),
  children: true,
  render: ({ props, children }) => ui.nav({ 'aria-label': props.label }, children),
})

const pagerStyles = tv({
  slots: {
    base: 'flex items-center justify-between gap-3 text-sm text-ink-muted',
    summary: 'tabular-nums',
    links: 'flex items-center gap-2',
    link: 'inline-flex h-8 items-center rounded-control border border-line-strong bg-surface px-3 text-xs font-medium text-ink shadow-control hover:bg-surface-sunken',
    off: 'inline-flex h-8 cursor-not-allowed items-center rounded-control border border-line px-3 text-xs font-medium text-ink-faint',
  },
})

export const Pagination = ui.component({
  tag: 'nav',
  styles: pagerStyles,
  props: z.object({
    label: z.string().default('Pagination'),
    summary: z.string(),
    prevHref: z.string().nullable(),
    nextHref: z.string().nullable(),
    prevLabel: z.string().default('Previous'),
    nextLabel: z.string().default('Next'),
  }),
  render: ({ props, classes }) =>
    ui.nav({ 'aria-label': props.label }, [
      ui.p({ class: classes.summary }, [props.summary]),
      ui.div({ class: classes.links }, [
        props.prevHref !== null
          ? ui.a({ href: props.prevHref, rel: 'prev', class: classes.link }, [props.prevLabel])
          : ui.span({ class: classes.off, 'aria-disabled': 'true' }, [props.prevLabel]),
        props.nextHref !== null
          ? ui.a({ href: props.nextHref, rel: 'next', class: classes.link }, [props.nextLabel])
          : ui.span({ class: classes.off, 'aria-disabled': 'true' }, [props.nextLabel]),
      ]),
    ]),
})
