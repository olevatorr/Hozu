import { type Child, contract, part, ui } from '@hozu/core'
import { archive, list, PAGE } from '../../routes.ts'
import {
  Add,
  Archive,
  addedDay,
  addNote,
  bulkNotes,
  CancelEdit,
  Draft,
  DUPLICATE,
  Edit,
  exportAll,
  GONE,
  lastDeleted,
  listArchived,
  listed,
  listNotes,
  MAX_TITLE,
  type NoteT,
  noMatch,
  notesMachine,
  Pin,
  Remove,
  Restore,
  removeNote,
  Save,
  Search,
  Select,
  Share,
  sharedWithMe,
  TOO_MANY,
  text,
  togglePin,
  Undo,
  Unshare,
  visible,
} from './model.ts'

const bulk = ui.formRef()

const itemForm = part(
  (
    event: typeof Pin | typeof Remove | typeof Edit | typeof Archive | typeof Restore,
    id: string,
    label: Child,
  ) =>
    ui.form({ on: { submit: ui.send(event, { id: ui.dom.form('id') }) } }, [
      ui.input({ type: 'hidden', name: 'id', value: id }),
      ui.button({ type: 'submit', class: 'text-sm text-slate-600 underline' }, [label]),
    ]),
)

const editForm = part((note: NoteT) => [
  ui.form(
    {
      class: 'flex flex-1 gap-2',
      on: { submit: ui.send(Save, { id: ui.dom.form('id'), title: ui.dom.form('title') }) },
    },
    [
      ui.input({ type: 'hidden', name: 'id', value: note.id }),
      ui.input({
        name: 'title',
        'aria-label': 'Edit title',
        required: true,
        maxlength: MAX_TITLE,
        value: note.title,
        class: 'flex-1 rounded border px-2 py-1',
      }),
      ui.button({ type: 'submit', class: 'text-sm text-indigo-700 underline' }, ['Save']),
    ],
  ),
  ui.form({ on: { submit: ui.send(CancelEdit, {}) } }, [
    ui.button({ type: 'submit', class: 'text-sm text-slate-600 underline' }, ['Cancel']),
  ]),
])

const noteItem = part((note: NoteT, editing: string) =>
  ui.li({ class: 'flex flex-wrap items-center gap-3 px-4 py-3' }, [
    ui.label({ class: 'flex items-center' }, [
      ui.input({
        type: 'checkbox',
        form: bulk,
        name: 'ids',
        value: note.id,
        on: { change: ui.send(Select, { id: note.id, checked: ui.dom.checked }) },
      }),
      ui.span({ class: 'sr-only' }, ['Select ', note.title]),
    ]),
    editing === note.id ? editForm(note) : ui.span({ class: 'flex-1' }, [note.title]),
    ui.time({ datetime: note.createdAt, class: 'text-xs text-slate-500' }, [
      'Added ',
      addedDay({ at: note.createdAt }),
    ]),
    note.pinned === true && ui.span({ class: 'text-xs text-amber-700' }, ['pinned']),
    itemForm(Pin, note.id, note.pinned === true ? 'Unpin' : 'Pin'),
    itemForm(Edit, note.id, 'Edit'),
    itemForm(Archive, note.id, 'Archive'),
    itemForm(Remove, note.id, text.delete),
    ui.form(
      {
        class: 'flex gap-2',
        on: { submit: ui.send(Share, { id: ui.dom.form('id'), to: ui.dom.form('to') }) },
      },
      [
        ui.input({ type: 'hidden', name: 'id', value: note.id }),
        ui.input({
          name: 'to',
          'aria-label': 'Share with',
          required: true,
          class: 'w-28 rounded border px-2 py-1',
        }),
        ui.button({ type: 'submit', class: 'text-sm text-slate-600 underline' }, ['Share']),
      ],
    ),
    ui.each(note.sharedWith, null, (name) =>
      ui.span({ class: 'flex items-center gap-2 text-xs text-slate-500' }, [
        `shared with ${name}`,
        ui.form({ on: { submit: ui.send(Unshare, { id: ui.dom.form('id'), to: ui.dom.form('to') }) } }, [
          ui.input({ type: 'hidden', name: 'id', value: note.id }),
          ui.input({ type: 'hidden', name: 'to', value: name }),
          ui.button({ type: 'submit', class: 'underline' }, [`Unshare ${name}`]),
        ]),
      ]),
    ),
  ]),
)

const sharedList = ui.query(
  sharedWithMe,
  {},
  {
    ready: (notes) =>
      notes.length === 0
        ? null
        : ui.section({ class: 'space-y-3' }, [
            ui.h2({ class: 'text-xl font-semibold' }, ['Shared with me']),
            ui.ul({ class: 'divide-y rounded border' }, [
              ui.each(notes, 'id', (note) =>
                ui.li({ class: 'flex gap-3 px-4 py-3' }, [
                  ui.span({ class: 'flex-1' }, [note.title]),
                  ui.span({ class: 'text-xs text-slate-500' }, [`from ${note.owner}`]),
                ]),
              ),
            ]),
          ]),
    failed: { Unexpected: () => null },
  },
)

export const NotesBoard = ui.view({
  machine: notesMachine,
  route: list,
  seed: ({ search }) => ({ query: search.q }),
  render: ({ ctx, when, search }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-8' }, [
      ui.h1({ class: 'text-3xl font-bold' }, [text.notes]),
      ui.p({ class: 'flex gap-4 text-sm' }, [
        ui.a({ href: ui.link(archive, null), class: 'text-indigo-700 underline' }, ['Archived notes']),
        ui.a({ href: ui.link(exportAll, {}), class: 'text-indigo-700 underline' }, ['Export']),
      ]),
      ui.form(
        {
          class: 'flex flex-wrap gap-2',
          on: { submit: ui.send(Add, { title: ui.dom.form('title') }) },
        },
        [
          ui.label({ for: 'title', class: 'sr-only' }, [text.title]),
          ui.input({
            id: 'title',
            name: 'title',
            required: true,
            maxlength: MAX_TITLE,
            value: ctx.draft,
            placeholder: text.title,
            'aria-invalid': ctx.fields.title !== null,
            'aria-describedby': 'title-error',
            class: 'flex-1 rounded border px-3 py-2',
            on: { input: ui.send(Draft, { title: ui.dom.value }) },
          }),
          ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, [text.add]),
        ],
      ),
      ui.p({ id: 'title-error', role: 'alert', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
      ctx.error !== null &&
        ui.p({ role: 'alert', class: 'text-rose-600' }, [
          ctx.error === DUPLICATE ? text.duplicate : ctx.error,
        ]),
      ui.query(
        lastDeleted,
        {},
        {
          ready: (deleted) =>
            deleted === null
              ? null
              : ui.div(
                  {
                    role: 'status',
                    class: 'flex items-center gap-3 rounded bg-slate-100 px-4 py-2 text-sm',
                  },
                  [
                    `Deleted "${deleted.title}"`,
                    ui.form({ on: { submit: ui.send(Undo, {}) } }, [
                      ui.button({ type: 'submit', class: 'text-indigo-700 underline' }, ['Undo']),
                    ]),
                  ],
                ),
          failed: { Unexpected: () => null },
        },
      ),
      ui.form({ method: 'get', class: 'flex gap-2' }, [
        ui.label({ for: 'search', class: 'sr-only' }, [text.search]),
        ui.input({
          id: 'search',
          type: 'search',
          name: 'q',
          value: ctx.query,
          class: 'flex-1 rounded border px-3 py-2',
          on: { input: ui.send(Search, { query: ui.dom.value }) },
        }),
        ui.button({ type: 'submit', class: 'rounded border px-4 py-2' }, ['Search']),
      ]),
      ui.query(
        listNotes,
        { q: search.q, limit: search.limit },
        {
          ready: (page) =>
            ui.section({ class: 'space-y-3' }, [
              ui.p({ class: 'text-sm text-slate-600' }, [text.count({ count: page.total })]),
              ui.p({ class: 'text-sm text-slate-600' }, [
                `Showing ${listed({ items: page.notes, query: ctx.query })} of ${page.matching}`,
              ]),
              ui.form(
                {
                  ref: bulk,
                  method: 'post',
                  action: ui.link(bulkNotes),
                  class: 'flex items-center gap-3 text-sm',
                },
                [
                  ui.span({ class: 'text-slate-600' }, [`Selected: ${ctx.selected.length}`]),
                  ui.button({ type: 'submit', name: 'action', value: 'delete', class: 'underline' }, [
                    'Delete selected',
                  ]),
                  ui.button({ type: 'submit', name: 'action', value: 'archive', class: 'underline' }, [
                    'Archive selected',
                  ]),
                ],
              ),
              when(
                ['adding'],
                [
                  ui.ul({ class: 'rounded border' }, [
                    ui.li({ class: 'flex gap-3 px-4 py-3 opacity-60', 'aria-busy': 'true' }, [
                      ui.span({ class: 'flex-1' }, [ctx.draft]),
                      ui.span({ class: 'text-xs text-slate-500' }, ['saving…']),
                    ]),
                  ]),
                ],
              ),
              noMatch({ items: page.notes, query: ctx.query })
                ? ui.p({ class: 'text-slate-500' }, ['No notes match'])
                : ui.ul({ class: 'divide-y rounded border' }, [
                    ui.each(visible({ items: page.notes, query: ctx.query }), 'id', (note) =>
                      noteItem(note, ctx.editing),
                    ),
                  ]),
              page.notes.length < page.matching &&
                ui.a(
                  {
                    href: ui.link(list, null, {
                      q: search.q,
                      limit: search.limit + PAGE,
                    }),
                    class: 'block text-center text-indigo-700 underline',
                  },
                  ['Load more'],
                ),
            ]),
          pending: ui.p({}, ['Loading…']),
          failed: {
            Unauthorized: () => ui.p({ role: 'alert' }, ['Signed out']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Notes are unavailable']),
          },
        },
      ),
      sharedList,
    ]),
})

export const ArchiveBoard = ui.view({
  machine: notesMachine,
  route: archive,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-8' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Archive']),
      ui.a({ href: ui.link(list, null), class: 'text-sm text-indigo-700 underline' }, ['Back to notes']),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
      ui.query(
        listArchived,
        {},
        {
          ready: (notes) =>
            notes.length === 0
              ? ui.p({ class: 'text-slate-500' }, ['No archived notes'])
              : ui.ul({ class: 'divide-y rounded border' }, [
                  ui.each(notes, 'id', (note) =>
                    ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                      ui.span({ class: 'flex-1' }, [note.title]),
                      itemForm(Restore, note.id, 'Restore'),
                    ]),
                  ),
                ]),
          failed: {
            Unauthorized: () => ui.p({ role: 'alert' }, ['Signed out']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Notes are unavailable']),
          },
        },
      ),
    ]),
})

const note = (id: string, title: string, pinned = false) => ({
  id,
  title,
  pinned,
  sharedWith: [],
  createdAt: '2026-09-29T08:15:00.000Z',
})

export const typesDraft = contract(notesMachine, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { title: 'Milk' } }],
  expect: { state: 'idle', changes: { draft: 'Milk' } },
})

export const adds = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Milk' } },
    { send: Add, payload: { title: 'Milk' } },
    { done: addNote, result: note('n9', 'Milk') },
  ],
  expect: { state: 'idle', effects: [{ effect: addNote, input: { title: 'Milk' } }] },
})

export const rejectsDuplicate = contract(notesMachine, {
  given: { state: 'adding' },
  when: [{ failed: addNote, error: 'Duplicate', data: { title: 'Milk' } }],
  expect: { state: 'idle', changes: { error: DUPLICATE } },
})

export const rejectsTooMany = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Milk' } },
    { failed: addNote, error: 'TooMany', data: {} },
  ],
  expect: {
    state: 'idle',
    changes: { draft: 'Milk', error: TOO_MANY },
    effects: [{ effect: addNote, input: { title: 'Milk' } }],
  },
})

export const rejectsInvalid = contract(notesMachine, {
  given: { state: 'adding' },
  when: [
    {
      failed: addNote,
      error: 'Invalid',
      data: { message: 'title: Write something', fields: { title: 'Write something' } },
    },
  ],
  expect: { state: 'idle', changes: { fields: { title: 'Write something' } } },
})

export const addFails = contract(notesMachine, {
  given: { state: 'adding' },
  when: [{ failed: addNote, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const removes = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Remove, payload: { id: 'n1' } },
    { done: removeNote, result: { id: 'n1' } },
  ],
  expect: {
    state: 'idle',
    changes: { target: 'n1' },
    effects: [{ effect: removeNote, input: { id: 'n1' } }],
  },
})

export const removeMissing = contract(notesMachine, {
  given: { state: 'removing' },
  when: [{ failed: removeNote, error: 'NotFound', data: { id: 'n1' } }],
  expect: { state: 'idle', changes: { error: GONE } },
})

export const removeFails = contract(notesMachine, {
  given: { state: 'removing' },
  when: [{ failed: removeNote, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const pins = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Pin, payload: { id: 'n1' } },
    { done: togglePin, result: note('n1', 'Milk', true) },
  ],
  expect: { state: 'idle', changes: { target: 'n1' }, effects: [{ effect: togglePin, input: { id: 'n1' } }] },
})

export const pinMissing = contract(notesMachine, {
  given: { state: 'pinning' },
  when: [{ failed: togglePin, error: 'NotFound', data: { id: 'n1' } }],
  expect: { state: 'idle', changes: { error: GONE } },
})

export const pinFails = contract(notesMachine, {
  given: { state: 'pinning' },
  when: [{ failed: togglePin, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const searches = contract(notesMachine, {
  given: { state: 'idle' },
  when: [{ send: Search, payload: { query: 'milk' } }],
  expect: { state: 'idle', changes: { query: 'milk' } },
})

export const selects = contract(notesMachine, {
  given: { state: 'idle', context: { selected: [{ id: 'n1' }] } },
  when: [{ send: Select, payload: { id: 'n2', checked: true } }],
  expect: { state: 'idle', changes: { selected: [{ id: 'n1' }, { id: 'n2' }] } },
})

export const unselects = contract(notesMachine, {
  given: { state: 'idle', context: { selected: [{ id: 'n1' }, { id: 'n2' }] } },
  when: [{ send: Select, payload: { id: 'n1', checked: false } }],
  expect: { state: 'idle', changes: { selected: [{ id: 'n2' }] } },
})
