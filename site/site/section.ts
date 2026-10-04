import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: '',
    body: 'mx-auto min-w-0 max-w-6xl px-5 py-14 md:py-28',
    kicker: 'mb-5 font-mono text-xs font-bold uppercase tracking-widest',
  },
  variants: {
    tone: {
      paper: { base: 'bg-paper text-ink', kicker: 'text-ember' },
      ink: { base: 'bg-ink text-paper', kicker: 'text-red' },
    },
  },
  defaultVariants: { tone: 'paper' },
})
export const Section = ui.component({
  tag: 'section',
  styles,
  props: z.object({ kicker: z.string() }),
  children: true,
  render: ({ props, children, classes }) =>
    ui.section({}, [
      ui.div({ class: classes.body }, [ui.p({ class: classes.kicker }, [props.kicker]), ...children]),
    ]),
})
