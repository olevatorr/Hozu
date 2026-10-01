import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'relative overflow-hidden bg-ink py-3 text-sm font-black uppercase text-paper',
    track: 'flex w-max animate-ticker gap-8 whitespace-nowrap',
    pause: 'absolute right-0 top-0 flex h-full items-center gap-1 bg-ink px-3 text-xs',
  },
})
export const Ticker = ui.component({
  tag: 'div',
  styles,
  props: z.object({ items: z.array(z.string()) }),
  slots: ['source'],
  render: ({ props, slots, classes }) =>
    ui.div({ 'data-ticker': '' }, [
      ui.div({ class: classes.track, 'data-ticker-track': '', 'aria-hidden': 'true' }, [
        ui.span({ class: 'flex gap-8' }, [ui.each(props.items, null, (i) => ui.span({}, [i, ' ■']))]),
        ui.span({ class: 'flex gap-8' }, [ui.each(props.items, null, (i) => ui.span({}, [i, ' ■']))]),
      ]),
      ui.div({ class: classes.pause }, [
        slots.source,
        ui.label({}, [ui.input({ type: 'checkbox' }), ' Pause']),
      ]),
    ]),
})
