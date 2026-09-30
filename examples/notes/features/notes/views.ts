import { contract, part, ui } from '@hozu/core'
import {
  Add,
  addNote,
  Draft,
  DUPLICATE,
  GONE,
  listNotes,
  noMatch,
  notesMachine,
  Pin,
  Remove,
  removeNote,
  Search,
  togglePin,
  total,
  visible,
} from './model.ts'

const itemForm = part((event: typeof Pin | typeof Remove, id: string, label: string) =>
  ui.form({ on: { submit: ui.send(event, { id: ui.dom.form('id') }) } }, [
    ui.input({ type: 'hidden', name: 'id', value: id }),
    ui.button({ type: 'submit', class: 'text-sm text-slate-600 underline' }, [label]),
  ]),
)

export const NotesBoard = ui.view({
  machine: notesMachine,
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-8' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { text: ui.dom.form('text') }) } }, [
        ui.label({ for: 'note', class: 'sr-only' }, ['New note']),
        ui.input({
          id: 'note',
          name: 'text',
          required: true,
          maxlength: 100,
          value: ctx.draft,
          placeholder: 'New note',
          'aria-invalid': ctx.fields.text !== null,
          'aria-describedby': 'note-error',
          class: 'flex-1 rounded border px-3 py-2',
          on: { input: ui.send(Draft, { text: ui.dom.value }) },
        }),
        ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),
      ]),
      ui.p({ id: 'note-error', class: 'text-sm text-rose-600' }, [ctx.fields.text]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
      when(['adding'], [ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])]),
      ui.label({ for: 'search', class: 'block text-sm font-medium' }, ['Search']),
      ui.input({
        id: 'search',
        type: 'search',
        value: ctx.query,
        class: 'w-full rounded border px-3 py-2',
        on: { input: ui.send(Search, { query: ui.dom.value }) },
      }),
      ui.query(
        listNotes,
        {},
        {
          ready: (notes) =>
            ui.section({ class: 'space-y-3' }, [
              ui.p({ class: 'text-sm text-slate-600' }, ['Notes: ', total({ items: notes })]),
              noMatch({ items: notes, query: ctx.query })
                ? ui.p({ class: 'text-slate-500' }, ['No notes match'])
                : ui.ul({ class: 'divide-y rounded border' }, [
                    ui.each(visible({ items: notes, query: ctx.query }), 'id', (note) =>
                      ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                        ui.span({ class: 'flex-1' }, [note.text]),
                        note.pinned === true && ui.span({ class: 'text-xs text-amber-700' }, ['pinned']),
                        itemForm(Pin, note.id, note.pinned === true ? 'Unpin' : 'Pin'),
                        itemForm(Remove, note.id, 'Delete'),
                      ]),
                    ),
                  ]),
            ]),
          pending: ui.p({}, ['Loading…']),
          failed: {
            Unauthorized: () => ui.p({ role: 'alert' }, ['Signed out']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Notes are unavailable']),
          },
        },
      ),
    ]),
})

const note = (id: string, text: string, pinned = false) => ({ id, text, pinned })

export const typesDraft = contract(notesMachine, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { text: 'Milk' } }],
  expect: { state: 'idle', changes: { draft: 'Milk' } },
})

export const adds = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { text: 'Milk' } },
    { send: Add, payload: { text: 'Milk' } },
    { done: addNote, result: note('n9', 'Milk') },
  ],
  expect: { state: 'idle', effects: [{ effect: addNote, input: { text: 'Milk' } }] },
})

export const rejectsDuplicate = contract(notesMachine, {
  given: { state: 'adding' },
  when: [{ failed: addNote, error: 'Duplicate', data: { text: 'Milk' } }],
  expect: { state: 'idle', changes: { error: DUPLICATE } },
})

export const rejectsInvalid = contract(notesMachine, {
  given: { state: 'adding' },
  when: [
    {
      failed: addNote,
      error: 'Invalid',
      data: { message: 'text: Write something', fields: { text: 'Write something' } },
    },
  ],
  expect: { state: 'idle', changes: { fields: { text: 'Write something' } } },
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
