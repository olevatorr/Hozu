import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'max-w-md overflow-x-auto border-4 border-ink bg-white p-4 sm:p-5 font-mono text-sm text-ink shadow-[8px_8px_0_var(--color-ink)]',
    head: 'font-bold uppercase',
    rule: 'my-3 border-t-2 border-dashed border-ink',
  },
})
export const Receipt = ui.component({
  tag: 'div',
  styles,
  props: z.object({}),
  slots: ['pay', 'get'],
  render: ({ slots, classes }) =>
    ui.div({}, [
      ui.p({ class: classes.head }, ['You pay']),
      slots.pay,
      ui.hr({ class: classes.rule }),
      ui.p({ class: classes.head }, ['You get']),
      slots.get,
    ]),
})
export const ReceiptLine = ui.component({
  tag: 'a',
  styles: tv({ base: 'flex items-baseline justify-between gap-3 py-1 underline-offset-4 hover:underline' }),
  props: z.object({ claim: z.string(), label: z.string(), value: z.string(), href: z.string() }),
  render: ({ props }) =>
    ui.a({ href: props.href, 'data-claim': props.claim }, [
      ui.span({ class: 'min-w-0' }, [props.label]),
      ui.b({ class: 'shrink-0 whitespace-nowrap text-right' }, [props.value]),
    ]),
})
