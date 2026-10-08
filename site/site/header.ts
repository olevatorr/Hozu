import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'sticky top-0 z-30 border-b-4 border-ink bg-paper',
    bar: 'mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4',
    skip: 'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper',
    desktop: 'hidden gap-6 whitespace-nowrap text-xs font-extrabold uppercase tracking-widest lg:flex',
    mobile: 'group lg:hidden [&:not([open])>div]:hidden [&::details-content]:[content-visibility:visible]',
    toggle:
      'flex list-none items-center gap-2 border-4 border-ink px-3 py-1.5 text-xs font-black uppercase tracking-widest select-none group-open:bg-ink group-open:text-paper [&::-webkit-details-marker]:hidden',
    bars: 'grid w-4 gap-[3px] [&>i]:block [&>i]:h-[3px] [&>i]:bg-current [&>i]:transition-[transform,opacity] [&>i]:duration-200 group-open:[&>i:nth-child(1)]:translate-y-[6px] group-open:[&>i:nth-child(1)]:rotate-45 group-open:[&>i:nth-child(2)]:opacity-0 group-open:[&>i:nth-child(3)]:-translate-y-[6px] group-open:[&>i:nth-child(3)]:-rotate-45 motion-reduce:[&>i]:transition-none',
    panel:
      'absolute inset-x-0 top-full origin-top border-y-4 border-ink bg-paper px-5 pb-4 shadow-[0_10px_0_0_rgb(17_16_16_/_0.12)] motion-safe:group-open:animate-menu',
  },
})
export const SiteHeader = ui.component({
  tag: 'header',
  styles,
  props: z.object({
    version: z.string(),
    skip: z.string().default('Skip to content'),
    navLabel: z.string().default('Main navigation'),
    menu: z.string().default('Menu'),
    close: z.string().default('Close'),
  }),
  slots: ['brand', 'nav', 'menu'],
  render: ({ props, slots, classes }) =>
    ui.header({}, [
      ui.a({ href: '#main', class: classes.skip }, [props.skip]),
      ui.div({ class: classes.bar, 'data-version': props.version }, [
        slots.brand,
        ui.nav({ 'aria-label': props.navLabel, class: classes.desktop }, [slots.nav]),
        ui.details({ class: classes.mobile }, [
          ui.summary({ class: classes.toggle }, [
            ui.span({ class: classes.bars, 'aria-hidden': 'true' }, [
              ui.i({}, []),
              ui.i({}, []),
              ui.i({}, []),
            ]),
            ui.span({ class: 'group-open:hidden' }, [props.menu]),
            ui.span({ class: 'hidden group-open:inline' }, [props.close]),
          ]),
          ui.div({ class: classes.panel }, [slots.menu]),
        ]),
      ]),
    ]),
})
