import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Item = z.object({ id: z.string(), title: z.string(), body: z.string() })
export const Steps = ui.component({
  tag: 'ol',
  styles: tv({
    slots: {
      base: 'grid gap-4 md:grid-cols-3',
      item: 'border-4 border-ink p-5',
      title: 'font-black uppercase',
    },
  }),
  props: z.object({ items: z.array(Item).default([]) }),
  children: true,
  render: ({ props, children, classes }) =>
    ui.ol({}, [
      ...children,
      ui.each(props.items, 'id', (i) =>
        ui.li({ class: classes.item }, [
          ui.p({ class: classes.title }, [i.title]),
          ui.p({ class: 'mt-2' }, [i.body]),
        ]),
      ),
    ]),
})
export const Step = ui.component({
  tag: 'li',
  styles: tv({ slots: { base: 'border-4 border-ink p-5', title: 'font-black uppercase' } }),
  props: z.object({ title: z.string(), body: z.string() }),
  render: ({ props, classes }) =>
    ui.li({}, [ui.p({ class: classes.title }, [props.title]), ui.p({ class: 'mt-2' }, [props.body])]),
})
