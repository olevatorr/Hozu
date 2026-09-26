import { op, ui } from '@tenonkit/core'
import { home, taskPage } from '../../routes.ts'
import { getTask, isEmpty, listTasks, visible } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { tasksMachine } from './machine.ts'

const shows = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
] as const

const priorities = ['low', 'normal', 'high'] as const

export const Board = ui.view({
  machine: tasksMachine,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold tracking-tight text-slate-900' }, ['Tasks']),
      ui.form(
        {
          class: 'flex items-end gap-2',
          on: { submit: ui.send(Add, { title: ui.dom.form('title'), priority: ui.dom.form('priority') }) },
        },
        [
          ui.div({ class: 'flex flex-1 flex-col gap-1' }, [
            ui.label({ for: 'title', class: 'text-sm font-medium text-slate-700' }, ['New task']),
            ui.input({
              id: 'title',
              name: 'title',
              type: 'text',
              required: true,
              minlength: 3,
              maxlength: 80,
              value: ctx.draft,
              class:
                'rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none',
              on: { input: ui.send(Draft, { text: ui.dom.value }) },
            }),
          ]),
          ui.div({ class: 'flex flex-col gap-1' }, [
            ui.label({ for: 'priority', class: 'text-sm font-medium text-slate-700' }, ['Priority']),
            ui.select(
              {
                id: 'priority',
                name: 'priority',
                class:
                  'rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none',
              },
              priorities.map((p) => ui.option({ value: p, selected: p === 'normal' }, [p])),
            ),
          ]),
          ui.button(
            {
              type: 'submit',
              class: 'rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700',
            },
            ['Add'],
          ),
        ],
      ),
      ui.if(
        op.neq(ctx.error, null),
        [
          ui.p({ role: 'alert', class: 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700' }, [
            ctx.error,
          ]),
        ],
        [],
      ),
      ui.div({ class: 'flex items-center gap-2' }, [
        ...shows.map((s) =>
          ui.button(
            {
              type: 'button',
              'aria-pressed': op.eq(ctx.show, s.value),
              class:
                'rounded-full border border-slate-300 px-3 py-1 text-sm aria-pressed:border-indigo-600 aria-pressed:bg-indigo-600 aria-pressed:text-white',
              on: { click: ui.send(SetShow, { show: s.value }) },
            },
            [s.label],
          ),
        ),
        ui.button(
          {
            type: 'button',
            class:
              'ml-auto rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50',
            on: { click: ui.send(ClearDone, {}) },
          },
          ['Clear done'],
        ),
      ]),
      ui.query(
        listTasks,
        {},
        {
          ready: (items) =>
            ui.if(
              isEmpty({ items, show: ctx.show }),
              [ui.p({ class: 'text-slate-500' }, ['No tasks'])],
              [
                ui.ul(
                  {
                    class: 'divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm',
                  },
                  [
                    ui.each(visible({ items, show: ctx.show }), 'id', (t) =>
                      ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                        ui.a(
                          {
                            href: ui.link(taskPage, { id: t.id }),
                            class: 'flex-1 text-slate-900 hover:underline',
                          },
                          [t.title],
                        ),
                        ui.span(
                          {
                            class: 'rounded-full px-2 py-0.5 text-xs font-medium',
                            toggle: {
                              'bg-emerald-100 text-emerald-700': op.eq(t.done, true),
                              'bg-amber-100 text-amber-700': op.eq(t.done, false),
                            },
                          },
                          [ui.if(op.eq(t.done, true), ['done'], ['open'])],
                        ),
                        ui.span(
                          {
                            class: 'rounded-full px-2 py-0.5 text-xs font-medium',
                            toggle: {
                              'bg-slate-100 text-slate-600': op.eq(t.priority, 'low'),
                              'bg-sky-100 text-sky-700': op.eq(t.priority, 'normal'),
                              'bg-rose-100 text-rose-700': op.eq(t.priority, 'high'),
                            },
                          },
                          [t.priority],
                        ),
                        ui.button(
                          {
                            type: 'button',
                            class: 'rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50',
                            on: { click: ui.send(Toggle, { id: t.id }) },
                          },
                          [ui.if(op.eq(t.done, true), ['Mark open'], ['Mark done'])],
                        ),
                      ]),
                    ),
                  ],
                ),
              ],
            ),
          pending: ui.p({}, ['Loading…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Tasks are unavailable']) },
        },
      ),
    ]),
})

export const Detail = ui.view({
  route: taskPage,
  render: ({ params }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-12' }, [
      ui.query(
        getTask,
        { id: params.id },
        {
          ready: (t) =>
            ui.article({ class: 'space-y-2' }, [
              ui.h1({ class: 'text-3xl font-bold tracking-tight text-slate-900' }, [t.title]),
              ui.p({ class: 'text-slate-600' }, [
                ui.if(op.eq(t.done, true), ['Status: done'], ['Status: open']),
              ]),
              ui.p({ class: 'text-slate-600' }, ['Priority: ', t.priority]),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert', class: 'text-rose-700' }, ['Task not found']),
            Unexpected: () => ui.p({ role: 'alert', class: 'text-rose-700' }, ['Task unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(home, null), class: 'text-indigo-600 hover:underline' }, ['Back']),
    ]),
})
