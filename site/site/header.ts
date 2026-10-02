import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'sticky top-0 z-30 border-b-4 border-ink bg-paper',
    bar: 'mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4',
    skip: 'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper',
    desktop: 'hidden gap-6 text-xs font-extrabold uppercase tracking-widest md:flex',
    mobile: 'md:hidden',
  },
})
export const SiteHeader = ui.component({
  tag: 'header',
  styles,
  props: z.object({ version: z.string() }),
  slots: ['brand', 'nav', 'menu'],
  render: ({ props, slots, classes }) =>
    ui.header({}, [
      ui.a({ href: '#main', class: classes.skip }, ['Skip to content']),
      ui.div({ class: classes.bar, 'data-version': props.version }, [
        slots.brand,
        ui.nav({ 'aria-label': 'Main navigation', class: classes.desktop }, [slots.nav]),
        ui.details({ class: classes.mobile }, [ui.summary({}, ['Menu']), slots.menu]),
      ]),
    ]),
})
