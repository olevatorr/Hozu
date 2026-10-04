import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Row = z.object({
  id: z.string(),
  framework: z.string(),
  versions: z.string(),
  requests: z.string(),
  js: z.string(),
  interactive: z.string(),
})
export const SpeedTable = ui.component({
  tag: 'div',
  styles: tv({
    slots: {
      base: 'overflow-x-auto',
      table: 'w-full min-w-[34rem] border-4 border-ink font-mono text-sm',
      cell: 'border-t-2 border-ink px-3 py-2 text-left',
    },
  }),
  props: z.object({ caption: z.string(), rows: z.array(Row) }),
  render: ({ props, classes }) =>
    ui.div({}, [
      ui.table({ class: classes.table }, [
        ui.caption({ class: 'py-2 text-left font-bold' }, [props.caption]),
        ui.thead({}, [
          ui.tr({}, [
            ui.th({ scope: 'col', class: classes.cell }, ['Framework']),
            ui.th({ scope: 'col', class: classes.cell }, ['Requests per second']),
            ui.th({ scope: 'col', class: classes.cell }, ['JavaScript (gzip)']),
            ui.th({ scope: 'col', class: classes.cell }, ['Interactive at']),
          ]),
        ]),
        ui.tbody({}, [
          ui.each(props.rows, 'id', (r) =>
            ui.tr({ 'data-speed': r.id }, [
              ui.th({ scope: 'row', class: classes.cell }, [
                r.framework,
                ui.span({ class: 'block text-xs font-normal' }, [r.versions]),
              ]),
              ui.td({ class: classes.cell }, [r.requests]),
              ui.td({ class: classes.cell }, [r.js]),
              ui.td({ class: classes.cell }, [r.interactive]),
            ]),
          ),
        ]),
      ]),
    ]),
})
