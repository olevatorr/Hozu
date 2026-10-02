import { ui } from '@hozu/core'
import { board, taskPage } from '../../routes.ts'
import { Badge } from '../../ui/badge.ts'
import { Button } from '../../ui/button.ts'
import { Card } from '../../ui/card.ts'
import { Field } from '../../ui/field.ts'
import { Input } from '../../ui/input.ts'
import {
  Add,
  AskRemove,
  Cancel,
  ConfirmRemove,
  Dismiss,
  Draft,
  getTask,
  listTasks,
  Move,
  nextStatus,
  noMatch,
  Search,
  summary,
  tasksMachine,
  visible,
} from './model.ts'

const owners = ['Ada', 'Grace', 'Linus'] as const
const tabs = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
] as const

export const Board = ui.view({
  machine: tasksMachine,
  route: board,
  render: ({ ctx, search, when }) =>
    ui.main({ class: 'mx-auto max-w-3xl space-y-8 px-4 py-10' }, [
      ui.header({ class: 'flex items-end justify-between gap-4' }, [
        ui.div({}, [
          ui.p({ class: 'text-xs font-semibold uppercase tracking-widest text-brand' }, ['Studio']),
          ui.h1({ class: 'text-3xl font-bold text-ink' }, ['Team tasks']),
        ]),
        ui.use(Badge, { props: { tone: 'brand' } }, ['Sprint 12']),
      ]),
      ui.query(
        summary,
        {},
        {
          ready: (s) =>
            ui.div({ class: 'grid grid-cols-3 gap-3' }, [
              ui.use(Card, {}, [
                ui.p({ class: 'text-sm text-slate-500' }, ['To do']),
                ui.p({ class: 'text-2xl font-bold' }, [s.todo]),
              ]),
              ui.use(Card, {}, [
                ui.p({ class: 'text-sm text-slate-500' }, ['Doing']),
                ui.p({ class: 'text-2xl font-bold' }, [s.doing]),
              ]),
              ui.use(Card, {}, [
                ui.p({ class: 'text-sm text-slate-500' }, ['Done']),
                ui.p({ class: 'text-2xl font-bold' }, [s.done]),
              ]),
            ]),
          pending: ui.p({ class: 'text-sm text-slate-500' }, ['Counting tasks…']),
          failed: {
            Unexpected: () => ui.p({ role: 'alert', class: 'text-brand' }, ['Counts are unavailable']),
          },
        },
      ),
      ui.use(Card, {}, [
        ui.form(
          {
            class: 'grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end',
            on: { submit: ui.send(Add, { title: ui.dom.form('title'), owner: ui.dom.form('owner') }) },
          },
          [
            ui.use(Field, {
              props: { for: 'title', label: 'New task', error: ctx.fields.title, errorId: 'title-error' },
              slots: {
                control: ui.use(Input, {
                  props: {
                    id: 'title',
                    name: 'title',
                    value: ctx.draft,
                    placeholder: 'What needs doing?',
                    invalid: ctx.fields.title !== null,
                    describedby: 'title-error',
                  },
                  on: { input: ui.send(Draft, { text: ui.dom.value }) },
                }),
              },
            }),
            ui.select(
              {
                name: 'owner',
                'aria-label': 'Owner',
                class: 'rounded-lg border border-slate-300 px-3 py-2 text-sm',
              },
              owners.map((o) => ui.option({ value: o, selected: ctx.owner === o }, [o])),
            ),
            ui.use(Button, { props: { type: 'submit' } }, ['Add task']),
          ],
        ),
        ctx.error !== null && ui.p({ role: 'alert', class: 'mt-3 text-sm text-brand' }, [ctx.error]),
        when(
          ['adding'],
          [
            ui.p({ class: 'mt-3 text-sm text-slate-500', 'aria-busy': 'true' }, [
              'Saving “',
              ctx.draft,
              '”…',
            ]),
          ],
        ),
      ]),
      when(
        ['saved'],
        [
          ui.div(
            {
              role: 'status',
              class: 'flex items-center justify-between rounded-xl bg-ok px-4 py-3 text-sm text-white',
            },
            [
              ui.span({}, [ctx.notice]),
              ui.use(
                Button,
                {
                  variant: { tone: 'ghost', size: 'sm' },
                  class: 'text-white!',
                  on: { press: ui.send(Dismiss, {}) },
                },
                ['Dismiss'],
              ),
            ],
          ),
        ],
      ),
      ui.div({ class: 'flex flex-wrap items-center justify-between gap-3' }, [
        ui.nav(
          { class: 'flex gap-1 rounded-lg bg-slate-100 p-1', 'aria-label': 'Show' },
          tabs.map((t) =>
            ui.a(
              {
                href: ui.link(board, null, { show: t.value }),
                'aria-current': search.show === t.value,
                class:
                  'rounded-md px-3 py-1.5 text-sm text-slate-600 aria-[current=true]:bg-white aria-[current=true]:text-ink aria-[current=true]:shadow-sm',
              },
              [t.label],
            ),
          ),
        ),
        ui.input({
          type: 'search',
          'aria-label': 'Search tasks',
          placeholder: 'Search',
          value: ctx.q,
          class: 'w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm',
          on: { input: ui.send(Search, { text: ui.dom.value }) },
        }),
      ]),
      ui.query(
        listTasks,
        {},
        {
          ready: (items) =>
            noMatch({ items, show: search.show, q: ctx.q })
              ? ui.use(Card, { class: 'text-center' }, [
                  ui.p({ class: 'font-medium text-ink' }, ['No tasks match']),
                  ui.p({ class: 'text-sm text-slate-500' }, ['Try another tab or clear the search.']),
                ])
              : ui.ul({ class: 'space-y-2' }, [
                  ui.each(visible({ items, show: search.show, q: ctx.q }), 'id', (t) =>
                    ui.li(
                      {
                        class:
                          'flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3',
                      },
                      [
                        ui.use(Badge, { props: { tone: t.status } }, [t.status]),
                        ui.a(
                          {
                            href: ui.link(taskPage, { id: t.id }),
                            class: 'flex-1 font-medium text-ink hover:underline',
                          },
                          [t.title],
                        ),
                        ui.span({ class: 'text-sm text-slate-500' }, [t.owner, ' · ', t.due]),
                        ui.use(
                          Button,
                          {
                            variant: { tone: 'secondary', size: 'sm' },
                            on: { press: ui.send(Move, { id: t.id, status: nextStatus(t.status) }) },
                          },
                          ['Move'],
                        ),
                        ui.use(
                          Button,
                          {
                            variant: { tone: 'ghost', size: 'sm' },
                            on: { press: ui.send(AskRemove, { id: t.id, title: t.title }) },
                          },
                          ['Remove'],
                        ),
                      ],
                    ),
                  ),
                ]),
          pending: ui.p({ class: 'text-sm text-slate-500' }, ['Loading tasks…']),
          failed: {
            Unexpected: () => ui.p({ role: 'alert', class: 'text-brand' }, ['Tasks are unavailable']),
          },
        },
      ),
      when(
        ['confirming', 'removing'],
        [
          ui.div({ class: 'fixed inset-0 grid place-items-center bg-ink/40 p-4' }, [
            ui.use(Card, { class: 'w-full max-w-sm space-y-4' }, [
              ui.h2({ class: 'text-lg font-semibold' }, ['Remove “', ctx.targetTitle, '”?']),
              ui.p({ class: 'text-sm text-slate-500' }, ['It leaves the board for everyone.']),
              ui.div({ class: 'flex justify-end gap-2' }, [
                ui.use(Button, { variant: { tone: 'secondary' }, on: { press: ui.send(Cancel, {}) } }, [
                  'Cancel',
                ]),
                ui.use(Button, { variant: { tone: 'danger' }, on: { press: ui.send(ConfirmRemove, {}) } }, [
                  'Remove',
                ]),
              ]),
            ]),
          ]),
        ],
      ),
    ]),
})

export const Detail = ui.view({
  route: taskPage,
  render: ({ params }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-10' }, [
      ui.a({ href: ui.link(board, null), class: 'text-sm text-slate-500 hover:text-ink' }, ['← All tasks']),
      ui.query(
        getTask,
        { id: params.id },
        {
          ready: (t) =>
            ui.use(Card, { class: 'space-y-3' }, [
              ui.use(Badge, { props: { tone: t.status } }, [t.status]),
              ui.h1({ class: 'text-2xl font-bold text-ink' }, [t.title]),
              ui.p({ class: 'text-sm text-slate-500' }, ['Owner ', t.owner, ' · due ', t.due]),
            ]),
          pending: ui.p({}, ['Loading…']),
          failed: {
            NotFound: () => ui.p({ role: 'alert', class: 'text-brand' }, ['Task not found']),
            Unexpected: () => ui.p({ role: 'alert', class: 'text-brand' }, ['Task unavailable']),
          },
        },
      ),
    ]),
})
