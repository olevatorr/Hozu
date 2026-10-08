import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const Steps = ui.component({
  tag: 'ol',
  styles: tv({ base: 'grid gap-4 md:grid-cols-3' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.ol({}, children),
})
export const Step = ui.component({
  tag: 'li',
  styles: tv({ slots: { base: 'border-4 border-ink p-5', title: 'font-black uppercase' } }),
  props: z.object({ title: z.string(), body: z.string() }),
  render: ({ props, classes }) =>
    ui.li({}, [ui.p({ class: classes.title }, [props.title]), ui.p({ class: 'mt-2' }, [props.body])]),
})
