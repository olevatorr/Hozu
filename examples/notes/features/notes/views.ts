import { contract, part, ui } from '@hozu/core'
import { Button } from '../../ui/button.ts'
import { Input } from '../../ui/input.ts'
import {
  Add,
  Bulk,
  Draft,
  listNotes,
  noMatch,
  notesMachine,
  Pin,
  pinNotes,
  Remove,
  removeNotes,
  Search,
  Select,
  total,
  visible,
} from './model.ts'

const itemForm = part((event: typeof Pin | typeof Remove, id: string, label: string) =>
  ui.form({ on: { submit: ui.send(event, { id: ui.dom.form('id') }) } }, [
    ui.input({ type: 'hidden', name: 'id', value: id }),
    ui.use(Button, { variant: { tone: 'subtle' }, props: { type: 'submit' } }, [label]),
  ]),
)

const bulk = ui.formRef()

export const NotesBoard = ui.view({
  machine: notesMachine,
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-8' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { text: ui.dom.form('text') }) } }, [
        ui.label({ for: 'note', class: 'sr-only' }, ['New note']),
        ui.use(Input, {
          props: {
            id: 'note',
            name: 'text',
            required: true,
            maxlength: 100,
            value: ctx.draft,
            placeholder: 'New note',
            invalid: ctx.fields.text !== null,
            describedby: 'note-error',
          },
          on: { input: ui.send(Draft, { text: ui.dom.value }) },
          class: 'flex-1',
        }),
        ui.use(Button, { props: { type: 'submit' } }, ['Add']),
      ]),
      ui.p({ id: 'note-error', class: 'text-sm text-rose-600' }, [ctx.fields.text]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
      when(['adding'], [ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])]),
      ui.label({ for: 'search', class: 'block text-sm font-medium' }, ['Search']),
      ui.use(Input, {
        props: { id: 'search', type: 'search', value: ctx.query },
        on: { input: ui.send(Search, { query: ui.dom.value }) },
        class: 'w-full',
      }),
      ui.query(
        listNotes,
        {},
        {
          ready: (notes) =>
            ui.section({ class: 'space-y-3' }, [
              ui.p({ class: 'text-sm text-slate-600' }, ['Notes: ', total({ items: notes })]),
              ui.form(
                {
                  ref: bulk,
                  class: 'flex gap-2',
                  on: {
                    submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }),
                  },
                },
                [
                  ui.span({ class: 'flex-1 text-sm text-slate-600' }, ['Selected: ', ctx.selected.length]),
                  ui.use(
                    Button,
                    { variant: { tone: 'subtle' }, props: { type: 'submit', name: 'action', value: 'pin' } },
                    ['Pin selected'],
                  ),
                  ui.use(
                    Button,
                    {
                      variant: { tone: 'subtle' },
                      props: { type: 'submit', name: 'action', value: 'delete' },
                    },
                    ['Delete selected'],
                  ),
                ],
              ),
              noMatch({ items: notes, query: ctx.query })
                ? ui.p({ class: 'text-slate-500' }, ['No notes match'])
                : ui.ul({ class: 'divide-y rounded border' }, [
                    ui.each(visible({ items: notes, query: ctx.query }), 'id', (note) =>
                      ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                        ui.input({
                          type: 'checkbox',
                          form: bulk,
                          name: 'ids',
                          value: note.id,
                          'aria-label': `Select ${note.text}`,
                          checked: ctx.selected.includes(note.id),
                          disabled: ctx.busy,
                          on: { change: ui.send(Select, { id: note.id, checked: ui.dom.checked }) },
                        }),
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
            Forbidden: () => ui.p({ role: 'alert' }, ['Signed out']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Notes are unavailable']),
          },
        },
      ),
    ]),
})

export const selects = contract(notesMachine, {
  given: { state: 'idle', context: { selected: ['n1'] } },
  when: [{ send: Select, payload: { id: 'n2', checked: true } }],
  expect: { state: 'idle', changes: { selected: ['n1', 'n2'] } },
})

export const unselects = contract(notesMachine, {
  given: { state: 'idle', context: { selected: ['n1', 'n2'] } },
  when: [{ send: Select, payload: { id: 'n1', checked: false } }],
  expect: { state: 'idle', changes: { selected: ['n2'] } },
})

export const deletesSelected = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Bulk, payload: { ids: ['n1', 'n2'], action: 'delete' } },
    { done: removeNotes, result: { count: 2 } },
  ],
  expect: { state: 'idle', effects: [{ effect: removeNotes, input: { ids: ['n1', 'n2'] } }] },
})

export const pinsSelected = contract(notesMachine, {
  given: { state: 'idle' },
  when: [
    { send: Bulk, payload: { ids: ['n1'], action: 'pin' } },
    { done: pinNotes, result: { count: 1 } },
  ],
  expect: { state: 'idle', effects: [{ effect: pinNotes, input: { ids: ['n1'] } }] },
})
