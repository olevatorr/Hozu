import { op, ui } from '@tenon/core'
import { archive, home, tag } from '../../routes.ts'
import { byTag, byYear, listPage } from './effects.ts'
import { More } from './events.ts'
import { feedMachine } from './machine.ts'

const nav = ui.nav({ class: 'flex gap-4 text-sm' }, [
  ui.a({ href: ui.link(home, null), class: 'underline' }, ['Feed']),
  ui.a({ href: ui.link(archive, { year: null }), class: 'underline' }, ['Archive']),
  ui.a({ href: ui.link(archive, { year: '2026' }), class: 'underline' }, ['2026']),
])

export const Feed = ui.view({
  machine: feedMachine,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-2xl space-y-4 p-6' }, [
      nav,
      ui.h1({ class: 'text-2xl font-bold' }, ['Feed']),
      ui.each(ctx.cursors, null, (cursor) =>
        ui.query(
          listPage,
          { cursor },
          {
            ready: (page) =>
              ui.section({ class: 'space-y-2' }, [
                ui.ul({ class: 'space-y-2' }, [
                  ui.each(page.items, 'id', (item) =>
                    ui.li({ class: 'rounded border p-3' }, [
                      item.title,
                      ' · ',
                      ui.a({ href: ui.link(tag, { path: item.tags }), class: 'underline' }, [item.label]),
                    ]),
                  ),
                ]),
                ui.if(
                  op.and(op.eq(cursor, ctx.last), op.neq(page.next, null)),
                  [
                    ui.button(
                      {
                        type: 'button',
                        class: 'rounded border px-3 py-1',
                        on: { click: ui.send(More, { cursor: page.next }) },
                      },
                      ['Load more'],
                    ),
                    ui.div({ class: 'h-px', on: { visible: ui.send(More, { cursor: page.next }) } }, []),
                  ],
                  [],
                ),
              ]),
            pending: ui.p({}, ['Loading…']),
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['The feed is unavailable']) },
          },
        ),
      ),
    ]),
})

export const TagList = ui.view({
  route: tag,
  render: ({ params }) =>
    ui.main({ class: 'mx-auto max-w-2xl space-y-4 p-6' }, [
      nav,
      ui.query(
        byTag,
        { path: params.path },
        {
          ready: (items) =>
            ui.ul({ class: 'space-y-2' }, [
              ui.each(items, 'id', (item) => ui.li({}, [item.title, ' · ', item.label])),
            ]),
          pending: null,
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
        },
      ),
    ]),
})

export const Archive = ui.view({
  route: archive,
  render: ({ params }) =>
    ui.main({ class: 'mx-auto max-w-2xl space-y-4 p-6' }, [
      nav,
      ui.h1({ class: 'text-2xl font-bold' }, [ui.if(op.eq(params.year, null), ['All years'], [params.year])]),
      ui.query(
        byYear,
        { year: params.year },
        {
          ready: (items) =>
            ui.ul({ class: 'space-y-2' }, [
              ui.each(items, 'id', (item) => ui.li({}, [item.title, ' · ', item.year])),
            ]),
          pending: null,
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
        },
      ),
    ]),
})
