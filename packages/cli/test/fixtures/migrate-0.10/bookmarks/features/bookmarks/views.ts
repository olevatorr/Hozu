import { contract, ui } from '@hozu/core'
import { bookmarkPage, home } from '../../routes.ts'
import { Badge } from '../../ui/badge.ts'
import { Button } from '../../ui/button.ts'
import { Field } from '../../ui/field.ts'
import { Input } from '../../ui/input.ts'
import {
  Add,
  addBookmark,
  bookmarksMachine,
  Draft,
  getBookmark,
  isEmpty,
  listBookmarks,
  ToggleRead,
  visible,
} from './model.ts'

const kinds = ['article', 'video', 'podcast'] as const
const shows = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
] as const

export const Board = ui.view({
  machine: bookmarksMachine,
  route: home,
  render: ({ ctx, search, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Bookmarks']),
      ui.form(
        {
          class: 'flex items-start gap-2',
          on: { submit: ui.send(Add, { title: ui.dom.form('title'), kind: ui.dom.form('kind') }) },
        },
        [
          ui.use(Field, {
            props: { for: 'title', label: 'Title', error: ctx.fields.title, errorId: 'title-error' },
            slots: {
              control: ui.use(Input, {
                props: {
                  id: 'title',
                  name: 'title',
                  value: ctx.draft,
                  required: true,
                  minlength: 2,
                  maxlength: 80,
                  invalid: ctx.fields.title !== null,
                  describedby: 'title-error',
                },
                on: { input: ui.send(Draft, { text: ui.dom.value }) },
              }),
            },
          }),
          ui.select(
            { name: 'kind', 'aria-label': 'Kind', class: 'rounded border px-2 py-2' },
            kinds.map((k) => ui.option({ value: k, selected: ctx.kind === k }, [k])),
          ),
          ui.use(Button, { props: { type: 'submit' } }, ['Add']),
        ],
      ),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
      when(
        ['adding'],
        [
          ui.p({ class: 'rounded border px-4 py-3 opacity-50', 'aria-busy': 'true' }, [
            'Adding ',
            ctx.draft,
            '…',
          ]),
        ],
      ),
      ui.nav(
        { class: 'flex gap-2', 'aria-label': 'Show' },
        shows.map((s) =>
          ui.a(
            {
              href: ui.link(home, null, { show: s.value }),
              'aria-current': search.show === s.value,
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
            isEmpty({ items, show: search.show })
              ? ui.p({ class: 'text-slate-500' }, ['No bookmarks'])
              : ui.ul({ class: 'divide-y rounded border' }, [
                  ui.each(visible({ items, show: search.show }), 'id', (b) =>
                    ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                      ui.a({ href: ui.link(bookmarkPage, { id: b.id }), class: 'flex-1 underline' }, [
                        b.title,
                      ]),
                      ui.use(Badge, {}, [b.kind]),
                      ui.use(
                        Button,
                        { variant: { tone: 'quiet' }, on: { press: ui.send(ToggleRead, { id: b.id }) } },
                        [b.read ? 'Mark unread' : 'Mark read'],
                      ),
                    ]),
                  ),
                ]),
          pending: ui.p({}, ['Loading…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Bookmarks are unavailable']) },
        },
      ),
    ]),
})

export const Detail = ui.view({
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
              ui.use(Badge, {}, [b.read ? 'Read' : 'Unread']),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['Bookmark not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Bookmark unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(home, null), class: 'underline' }, ['Back']),
    ]),
})

export const addsBookmark = contract(bookmarksMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Hozu talk', kind: 'podcast' } },
    { send: Draft, payload: { text: 'ignored while adding' } },
    { done: addBookmark, result: { id: 'b3', title: 'Hozu talk', kind: 'podcast', read: false } },
  ],
  expect: {
    state: 'idle',
    changes: { kind: 'podcast' },
    effects: [
      { effect: addBookmark, input: { title: 'Hozu talk', kind: 'podcast' } },
      { navigate: '/bookmarks/b3' },
    ],
  },
})
