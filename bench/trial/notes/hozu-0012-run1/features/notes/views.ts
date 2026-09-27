import { contract, feature, op, ui } from '@hozu/core'
import { whoami } from '../auth/model.ts'
import { auth } from '../auth/views.ts'
import {
  Add,
  addNote,
  Delete,
  DUPLICATE,
  deleteNote,
  listNotes,
  matching,
  noMatch,
  notesMachine,
  notesTag,
  Search,
  SignOut,
  signOut,
  TogglePin,
  togglePin,
} from './model.ts'

export const NotesBoard = ui.view({
  machine: notesMachine,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.header({ class: 'flex items-center justify-between gap-4' }, [
        ui.div({}, [
          ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),
          ui.query(
            whoami,
            {},
            {
              ready: (u) => ui.p({ class: 'text-sm text-slate-600' }, ['Signed in as ', u.name]),
              pending: null,
              failed: {
                SignedOut: () => ui.p({ class: 'text-sm text-slate-600' }, ['Signed out']),
                Unexpected: () => ui.p({ role: 'alert' }, ['Account unavailable']),
              },
            },
          ),
        ]),
        ui.form({ on: { submit: ui.send(SignOut, {}) } }, [
          ui.button({ type: 'submit', class: 'rounded border border-slate-300 px-3 py-1 text-sm' }, [
            'Sign out',
          ]),
        ]),
      ]),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { text: ui.dom.form('text') }) } }, [
        ui.label({ for: 'new-note', class: 'sr-only' }, ['New note']),
        ui.input({
          id: 'new-note',
          name: 'text',
          type: 'text',
          required: true,
          maxlength: 100,
          value: ctx.draft,
          'aria-invalid': op.neq(ctx.fields.text, null),
          'aria-describedby': 'note-error',
          class: 'flex-1 rounded border border-slate-300 px-3 py-2',
        }),
        ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 font-medium text-white' }, [
          'Add',
        ]),
      ]),
      ui.p({ id: 'note-error', class: 'text-sm text-rose-600' }, [ctx.fields.text]),
      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error])], []),
      ui.div({ class: 'flex flex-col gap-1' }, [
        ui.label({ for: 'search', class: 'text-sm text-slate-600' }, ['Search']),
        ui.input({
          id: 'search',
          type: 'search',
          value: ctx.search,
          class: 'rounded border border-slate-300 px-3 py-2',
          on: { input: ui.send(Search, { text: ui.dom.value }) },
        }),
      ]),
      ui.query(
        listNotes,
        {},
        {
          ready: (list) =>
            ui.section({ class: 'space-y-3' }, [
              ui.p({ class: 'text-sm text-slate-600' }, ['Notes: ', list.count]),
              ui.if(
                noMatch({ notes: list.notes, text: ctx.search }),
                [ui.p({ class: 'text-slate-500' }, ['No notes match'])],
                [
                  ui.ul({ class: 'divide-y rounded border border-slate-200' }, [
                    ui.each(matching({ notes: list.notes, text: ctx.search }), 'id', (n) =>
                      ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                        ui.span({ class: 'flex-1' }, [n.text]),
                        ui.if(
                          op.eq(n.pinned, true),
                          [ui.span({ class: 'text-xs text-amber-700' }, ['pinned'])],
                          [],
                        ),
                        ui.form({ on: { submit: ui.send(TogglePin, { id: ui.dom.form('id') }) } }, [
                          ui.input({ type: 'hidden', name: 'id', value: n.id }),
                          ui.button({ type: 'submit', class: 'text-sm text-slate-700' }, [
                            ui.if(op.eq(n.pinned, true), ['Unpin'], ['Pin']),
                          ]),
                        ]),
                        ui.form({ on: { submit: ui.send(Delete, { id: ui.dom.form('id') }) } }, [
                          ui.input({ type: 'hidden', name: 'id', value: n.id }),
                          ui.button({ type: 'submit', class: 'text-sm text-rose-600' }, ['Delete']),
                        ]),
                      ]),
                    ),
                  ]),
                ],
              ),
            ]),
          pending: ui.p({}, ['Loading…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Notes are unavailable']) },
        },
      ),
    ]),
})

export const addsNote = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { text: 'Ship' } },
    { send: Add, payload: { text: 'Ship' } },
    { done: addNote, result: { id: 'n9', text: 'Ship', pinned: false } },
  ],
  expect: { state: 'idle', effects: [{ effect: addNote, input: { text: 'Ship' } }] },
})

export const rejectsDuplicate = contract(notesMachine, {
  given: { state: 'adding' },
  when: [{ failed: addNote, error: 'Duplicate', data: { text: 'Ship' } }],
  expect: { state: 'idle', changes: { error: DUPLICATE } },
})

export const rejectsInvalidNote = contract(notesMachine, {
  given: { state: 'adding' },
  when: [
    {
      failed: addNote,
      error: 'Invalid',
      data: { message: 'text: Write a note', fields: { text: 'Write a note' } },
    },
  ],
  expect: { state: 'idle', changes: { fields: { text: 'Write a note' } } },
})

export const addFails = contract(notesMachine, {
  given: { state: 'adding' },
  when: [{ failed: addNote, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const deletesNote = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Delete, payload: { id: 'n1' } },
    { done: deleteNote, result: { id: 'n1' } },
  ],
  expect: { state: 'idle', effects: [{ effect: deleteNote, input: { id: 'n1' } }] },
})

export const deleteMissing = contract(notesMachine, {
  given: { state: 'deleting' },
  when: [{ failed: deleteNote, error: 'NotFound', data: { id: 'n9' } }],
  expect: { state: 'idle' },
})

export const deleteFails = contract(notesMachine, {
  given: { state: 'deleting' },
  when: [{ failed: deleteNote, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const pinsNote = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: TogglePin, payload: { id: 'n1' } },
    { done: togglePin, result: { id: 'n1', text: 'Buy milk', pinned: true } },
  ],
  expect: { state: 'idle', effects: [{ effect: togglePin, input: { id: 'n1' } }] },
})

export const pinMissing = contract(notesMachine, {
  given: { state: 'pinning' },
  when: [{ failed: togglePin, error: 'NotFound', data: { id: 'n9' } }],
  expect: { state: 'idle' },
})

export const pinFails = contract(notesMachine, {
  given: { state: 'pinning' },
  when: [{ failed: togglePin, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const searches = contract(notesMachine, {
  given: { state: 'idle' },
  when: [{ send: Search, payload: { text: 'milk' } }],
  expect: { state: 'idle', changes: { search: 'milk' } },
})

export const signsOut = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignOut, payload: {} },
    { done: signOut, result: {} },
  ],
  expect: { state: 'idle', effects: [{ effect: signOut, input: {} }, { navigate: '/login' }] },
})

export const signOutFails = contract(notesMachine, {
  given: { state: 'signingOut' },
  when: [{ failed: signOut, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const notes = feature({
  id: 'notes',
  intent: {
    summary: 'Personal notes: each signed-in user lists, adds and deletes only their own notes.',
    invariants: [
      'Every user sees only their own notes',
      'Notes are unique per user, case-insensitive after trimming',
      'New notes are listed first',
      'Pinned notes are listed before the others; pins are per user',
    ],
  },
  imports: [auth],
  declarations: {
    Add,
    Delete,
    SignOut,
    TogglePin,
    Search,
    notesTag,
    listNotes,
    addNote,
    deleteNote,
    togglePin,
    signOut,
    matching,
    noMatch,
    notesMachine,
    NotesBoard,
    addsNote,
    rejectsDuplicate,
    rejectsInvalidNote,
    addFails,
    deletesNote,
    deleteMissing,
    deleteFails,
    pinsNote,
    pinMissing,
    pinFails,
    searches,
    signsOut,
    signOutFails,
  },
})
