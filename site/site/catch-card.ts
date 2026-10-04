import { ui } from '@hozu/core'
import { z } from 'zod'
import { peg } from './peg.ts'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'group relative h-48 perspective-distant sm:h-56',
    inner:
      'relative h-full transition-transform duration-500 transform-3d group-hover:rotate-y-180 group-focus-within:rotate-y-180',
    front:
      'absolute inset-0 flex flex-col justify-between border-4 border-paper p-4 text-xl font-black backface-hidden',
    back: 'absolute inset-0 overflow-auto border-4 border-red bg-paper p-4 pr-16 font-mono text-xs text-ink backface-hidden rotate-y-180',
  },
})
export const CatchCard = ui.component({
  tag: 'div',
  styles,
  props: z.object({
    code: z.string(),
    name: z.string(),
    story: z.string(),
    message: z.string(),
    fix: z.string(),
  }),
  render: ({ props, classes }) =>
    ui.div({ tabindex: 0 }, [
      ui.div({ class: classes.inner }, [
        ui.div({ class: classes.front }, [
          ui.p({ class: 'font-mono text-xs text-red' }, ['✘ ', props.code]),
          ui.p({}, [props.story]),
        ]),
        ui.div({ class: classes.back }, [
          ui.p({ class: 'font-bold text-ember' }, ['✘ ', props.code, ' ', props.name]),
          ui.p({ class: 'mt-2' }, [props.message]),
          ui.p({ class: 'mt-2' }, ['fix: ', props.fix]),
          peg('oops', 44, 'absolute right-1 bottom-2 h-auto', true),
        ]),
      ]),
    ]),
})
