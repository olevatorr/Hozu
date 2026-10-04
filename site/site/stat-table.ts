import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Row = z.object({ id: z.string(), label: z.string(), before: z.string(), after: z.string() })
export const StatTable = ui.component({
  tag: 'div',
  styles: tv({
    slots: {
      base: 'overflow-x-auto',
      table: 'w-full border-4 border-ink font-mono text-sm',
      cell: 'border-t-2 border-ink px-3 py-2 text-left',
    },
  }),
  props: z.object({ caption: z.string(), before: z.string(), after: z.string(), rows: z.array(Row) }),
  render: ({ props, classes }) =>
    ui.div({}, [
      ui.table({ class: classes.table }, [
        ui.caption({ class: 'py-2 text-left font-bold' }, [props.caption]),
        ui.thead({}, [
          ui.tr({}, [
            ui.th({ scope: 'col', class: classes.cell }, ['']),
            ui.th({ scope: 'col', class: classes.cell }, [props.before]),
            ui.th({ scope: 'col', class: classes.cell }, [props.after]),
          ]),
        ]),
        ui.tbody({}, [
          ui.each(props.rows, 'id', (r) =>
            ui.tr({}, [
              ui.th({ scope: 'row', class: classes.cell }, [r.label]),
              ui.td({ class: classes.cell }, [r.before]),
              ui.td({ class: classes.cell }, [r.after]),
            ]),
          ),
        ]),
      ]),
    ]),
})
