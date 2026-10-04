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
      table: 'hidden w-full min-w-[34rem] border-4 border-ink font-mono text-sm sm:table',
      cell: 'border-t-2 border-ink px-3 py-2 text-left',
      cards: 'grid gap-3 font-mono text-sm sm:hidden',
      card: 'border-4 border-ink p-3',
      stats: 'mt-2 grid grid-cols-3 gap-2',
    },
  }),
  props: z.object({ caption: z.string(), rows: z.array(Row) }),
  render: ({ props, classes }) =>
    ui.div({}, [
      ui.div({ class: classes.cards }, [
        ui.p({ class: 'font-bold' }, [props.caption]),
        ui.each(props.rows, 'id', (r) =>
          ui.div({ class: classes.card }, [
            ui.p({ class: 'font-bold' }, [r.framework]),
            ui.p({ class: 'text-xs' }, [r.versions]),
            ui.dl({ class: classes.stats }, [
              ui.div({}, [
                ui.dt({ class: 'text-xs' }, ['Requests/s']),
                ui.dd({ class: 'font-bold' }, [r.requests]),
              ]),
              ui.div({}, [ui.dt({ class: 'text-xs' }, ['JS (gzip)']), ui.dd({ class: 'font-bold' }, [r.js])]),
              ui.div({}, [
                ui.dt({ class: 'text-xs' }, ['Interactive']),
                ui.dd({ class: 'font-bold' }, [r.interactive]),
              ]),
            ]),
          ]),
        ),
      ]),
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
