import { op, ui } from '@tenon/core'
import { bookmarkPage, home } from '../../routes.ts'
import { getBookmark, isEmpty, listBookmarks, visible } from './effects.ts'
import { Add, Draft, ToggleRead } from './events.ts'
import { bookmarksMachine } from './machine.ts'

const kinds = ['article', 'video', 'podcast'] as const
const shows = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
] as const

export const Board = ui.view({
  machine: bookmarksMachine,
  route: home,
  render: ({ ctx, search }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Bookmarks']),
      ui.form(
        {
          class: 'flex gap-2',
          on: { submit: ui.send(Add, { title: ui.dom.form('title'), kind: ui.dom.form('kind') }) },
        },
        [
          ui.label({ for: 'title', class: 'sr-only' }, ['Title']),
          ui.input({
            id: 'title',
            name: 'title',
            required: true,
            minlength: 2,
            value: ctx.draft,
            class: 'flex-1 rounded border px-3 py-2',
            on: { input: ui.send(Draft, { text: ui.dom.value }) },
          }),
          ui.select(
            { name: 'kind', 'aria-label': 'Kind', class: 'rounded border px-2' },
            kinds.map((k) => ui.option({ value: k, selected: op.eq(ctx.kind, k) }, [k])),
          ),
          ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),
        ],
      ),
      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error])], []),
      ui.nav(
        { class: 'flex gap-2', 'aria-label': 'Show' },
        shows.map((s) =>
          ui.a(
            {
              href: ui.link(home, null, { show: s.value }),
              'aria-current': op.eq(search.show, s.value),
              class:
                'rounded-full border px-3 py-1 aria-[current=true]:bg-indigo-600 aria-[current=true]:text-white',
            },
            [s.label],
          ),
        ),
      ),
      ui.query(
        listBookmarks,
        {},
        {
          ready: (items) =>
            ui.if(
              isEmpty({ items, show: search.show }),
              [ui.p({ class: 'text-slate-500' }, ['No bookmarks'])],
              [
                ui.ul({ class: 'divide-y rounded border' }, [
                  ui.each(visible({ items, show: search.show }), 'id', (b) =>
                    ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                      ui.a({ href: ui.link(bookmarkPage, { id: b.id }), class: 'flex-1 underline' }, [
                        b.title,
                      ]),
                      ui.span({ class: 'text-xs text-slate-500' }, [b.kind]),
                      ui.button(
                        {
                          type: 'button',
                          class: 'text-sm',
                          on: { click: ui.send(ToggleRead, { id: b.id }) },
                        },
                        [ui.if(op.eq(b.read, true), ['Mark unread'], ['Mark read'])],
                      ),
                    ]),
                  ),
                ]),
              ],
            ),
          pending: ui.p({}, ['Loading…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Bookmarks are unavailable']) },
        },
      ),
    ]),
})

export const Detail = ui.view({
  machine: null,
  route: bookmarkPage,
  render: ({ params }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-12' }, [
      ui.query(
        getBookmark,
        { id: params.id },
        {
          ready: (b) =>
            ui.article({}, [
              ui.h1({ class: 'text-3xl font-bold' }, [b.title]),
              ui.p({}, ['Kind: ', b.kind]),
              ui.p({}, [ui.if(op.eq(b.read, true), ['Read'], ['Unread'])]),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['Bookmark not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Bookmark unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(home, null, null), class: 'underline' }, ['Back']),
    ]),
})
