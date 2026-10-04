import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'px-5 py-12',
    grid: 'mx-auto grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)_12rem]',
    nav: 'text-sm lg:sticky lg:top-24 lg:self-start',
    body: 'prose min-w-0 max-w-none break-words prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight prose-a:text-ink prose-a:decoration-red prose-a:decoration-2 prose-pre:overflow-x-auto prose-table:block prose-table:overflow-x-auto prose-pre:rounded-none prose-pre:border-4 prose-pre:border-ink prose-pre:bg-ink prose-pre:text-paper prose-code:before:content-none prose-code:after:content-none prose-figcaption:text-ink',
    aside: 'hidden text-sm lg:sticky lg:top-24 lg:block lg:self-start',
    pager: 'mt-12 flex justify-between gap-4 border-t-4 border-ink pt-6 font-bold',
  },
  variants: { width: { reading: { grid: 'max-w-7xl' }, single: { grid: 'max-w-4xl lg:grid-cols-1' } } },
  defaultVariants: { width: 'reading' },
})
export const Prose = ui.component({
  tag: 'main',
  styles,
  props: z.object({}),
  slots: ['nav', 'aside', 'pager'],
  children: true,
  render: ({ slots, children, classes }) =>
    ui.main({ id: 'main' }, [
      ui.div({ class: classes.grid }, [
        ui.div({ class: classes.nav }, [slots.nav]),
        ui.article({ class: classes.body }, [
          ...children,
          ui.nav({ class: classes.pager, 'aria-label': 'Previous and next pages' }, [slots.pager]),
        ]),
        ui.div({ class: classes.aside }, [slots.aside]),
      ]),
    ]),
})
