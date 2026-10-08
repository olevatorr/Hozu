import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'flex items-stretch overflow-hidden bg-ink text-sm font-black uppercase text-paper',
    source: 'flex shrink-0 items-center border-r-2 border-paper px-4 text-xs',
    window: 'min-w-0 flex-1 overflow-hidden py-3',
    track: 'flex w-max animate-ticker whitespace-nowrap',
    copy: 'flex shrink-0 gap-8 pr-8',
  },
})
export const Ticker = ui.component({
  tag: 'div',
  styles,
  props: z.object({}),
  slots: ['source'],
  children: true,
  render: ({ slots, children, classes }) =>
    ui.div({ 'data-ticker': '' }, [
      ui.div({ class: classes.source }, [slots.source]),
      ui.div({ class: classes.window, 'aria-hidden': 'true' }, [
        ui.div({ class: classes.track, 'data-ticker-track': '' }, [
          ui.span({ class: classes.copy }, children),
          ui.span({ class: classes.copy }, children),
        ]),
      ]),
    ]),
})
