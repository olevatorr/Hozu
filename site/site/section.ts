import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'grid border-b-4 border-ink md:grid-cols-[11rem_minmax(0,1fr)]',
    meter: 'border-ink p-4 text-xs font-extrabold uppercase tracking-widest md:border-r-4',
    bar: 'mt-2 h-2 bg-sand',
    fill: 'block h-full bg-red',
    body: 'min-w-0 px-5 py-14 md:px-10',
    kicker: 'mb-4 font-mono text-xs font-bold',
  },
  variants: {
    tone: {
      paper: { base: 'bg-paper text-ink', kicker: 'text-ember' },
      ink: { base: 'bg-ink text-paper', meter: 'border-paper', kicker: 'text-red' },
    },
    depth: {
      1: { fill: 'w-1/5' },
      2: { fill: 'w-2/5' },
      3: { fill: 'w-3/5' },
      4: { fill: 'w-4/5' },
      5: { fill: 'w-full' },
    },
  },
  defaultVariants: { tone: 'paper', depth: 1 },
})
export const Section = ui.component({
  tag: 'section',
  styles,
  props: z.object({ label: z.string(), kicker: z.string() }),
  children: true,
  render: ({ props, children, classes }) =>
    ui.section({}, [
      ui.div({ class: classes.meter, 'aria-hidden': 'true' }, [
        props.label,
        ui.div({ class: classes.bar }, [ui.span({ class: classes.fill }, [])]),
      ]),
      ui.div({ class: classes.body }, [ui.p({ class: classes.kicker }, [props.kicker]), ...children]),
    ]),
})
