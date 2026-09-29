import { contract, ui } from '@hozu/core'
import { bookmarkPage, home } from '../../routes.ts'
import {
  Add,
  addBookmark,
  bookmarksMachine,
  Draft,
  DUPLICATE,
  getBookmark,
  isEmpty,
  listBookmarks,
  ToggleRead,
  toggleRead,
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
            maxlength: 80,
            value: ctx.draft,
            'aria-invalid': ctx.fields.title !== null,
            'aria-describedby': 'title-error',
            class: 'flex-1 rounded border px-3 py-2',
            on: { input: ui.send(Draft, { text: ui.dom.value }) },
          }),
          ui.select(
            { name: 'kind', 'aria-label': 'Kind', class: 'rounded border px-2' },
            kinds.map((k) => ui.option({ value: k, selected: ctx.kind === k }, [k])),
          ),
          ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),
        ],
      ),
      ui.p({ id: 'title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
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
                      ui.span({ class: 'text-xs text-slate-500' }, [b.kind]),
                      ui.button(
                        {
                          type: 'button',
                          class: 'text-sm',
                          on: { click: ui.send(ToggleRead, { id: b.id }) },
                        },
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
              ui.p({}, [b.read ? 'Read' : 'Unread']),
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

export const typesDraft = contract(bookmarksMachine, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { text: 'Hozu' } }],
  expect: { state: 'idle', changes: { draft: 'Hozu' } },
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

export const rejectsDuplicate = contract(bookmarksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addBookmark, error: 'Duplicate', data: { title: 'Hozu talk' } }],
  expect: { state: 'idle', changes: { error: DUPLICATE } },
})

export const rejectsInvalidTitle = contract(bookmarksMachine, {
  given: { state: 'adding' },
  when: [
    {
      failed: addBookmark,
      error: 'Invalid',
      data: {
        message: 'title: Use at least 2 characters',
        fields: { title: 'Use at least 2 characters', kind: null },
      },
    },
  ],
  expect: { state: 'idle', changes: { fields: { title: 'Use at least 2 characters' } } },
})

export const addFails = contract(bookmarksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addBookmark, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const togglesRead = contract(bookmarksMachine, {
  given: { state: 'idle' },
  when: [
    { send: ToggleRead, payload: { id: 'b1' } },
    { done: toggleRead, result: { id: 'b1', title: 'A', kind: 'article', read: true } },
  ],
  expect: {
    state: 'idle',
    changes: { target: 'b1' },
    effects: [{ effect: toggleRead, input: { id: 'b1' } }],
  },
})

export const toggleMissing = contract(bookmarksMachine, {
  given: { state: 'toggling' },
  when: [{ failed: toggleRead, error: 'NotFound', data: { id: 'b9' } }],
  expect: { state: 'idle' },
})

export const toggleFails = contract(bookmarksMachine, {
  given: { state: 'toggling' },
  when: [{ failed: toggleRead, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})
