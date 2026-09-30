import { event, machine, on, ui } from '@hozu/core'
import { z } from 'zod'

export const Unpick = event({ payload: z.object({ id: z.string() }) })

export const picker = machine({
  context: z.object({ ids: z.array(z.string()) }),
  initialContext: { ids: ['a', 'b'] },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Unpick, {
          target: 'ready',
          assign: (e) => {
            ctx.ids = ctx.ids.filter((id) => id !== e.id)
          },
        }),
      ],
    },
  }),
})

export const View = ui.view({
  machine: picker,
  render: () => ui.button({ type: 'button', on: { click: ui.send(Unpick, { id: 'a' }) } }, ['Unpick a']),
})
