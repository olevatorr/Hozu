import { op, ui } from '@hozu/core'
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
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold tracking-tight text-slate-900' }, ['Tasks']),
      ui.form(
        {
          class: 'flex gap-2',
          on: { submit: ui.send(Add, { title: ui.dom.form('title'), priority: ui.dom.form('priority') }) },
        },
        [
          ui.label({ for: 'title', class: 'sr-only' }, ['New task']),
          ui.input({
            id: 'title',
            name: 'title',
            type: 'text',
            required: true,
            minlength: 3,
            maxlength: 80,
            placeholder: 'What needs doing?',
            value: ctx.draft,
            'aria-invalid': op.neq(ctx.fields.title, null),
            'aria-describedby': 'title-error',
            class:
              'flex-1 rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none',
            on: { input: ui.send(Draft, { text: ui.dom.value }) },
          }),
          ui.label({ for: 'priority', class: 'sr-only' }, ['Priority']),
          ui.select(
            {
              id: 'priority',
              name: 'priority',
              class:
                'rounded-lg border border-slate-300 px-2 py-2 shadow-sm focus:border-indigo-500 focus:outline-none',
            },
            priorities.map((p) => ui.option({ value: p, selected: op.eq(ctx.priority, p) }, [p])),
          ),
          ui.button(
            {
              type: 'submit',
              class:
                'rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-500',
            },
            ['Add'],
          ),
        ],
      ),
      ui.p({ id: 'title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
      ui.if(
        op.neq(ctx.error, null),
        [ui.p({ role: 'alert', class: 'rounded-lg bg-rose-50 px-3 py-2 text-rose-700' }, [ctx.error])],
        [],
      ),
      when(
        ['adding'],
        [ui.p({ class: 'text-sm text-slate-400', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])],
      ),
      ui.div(
        { class: 'flex gap-2', role: 'group', 'aria-label': 'Filter' },
        shows.map((s) =>
          ui.button(
            {
              type: 'button',
              'aria-pressed': op.eq(ctx.show, s.value),
              class: 'rounded-full border px-3 py-1 text-sm',
              toggle: {
                'border-indigo-600 bg-indigo-600 text-white': op.eq(ctx.show, s.value),
                'border-slate-300 text-slate-700': op.neq(ctx.show, s.value),
              },
              on: { click: ui.send(SetShow, { show: s.value }) },
            },
            [s.label],
          ),
        ),
      ),
      ui.form({ on: { submit: ui.send(ClearDone, {}) } }, [
        ui.button(
          {
            type: 'submit',
            class: 'rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50',
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
                    class: 'divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm',
                  },
                  [
                    ui.each(visible({ items, show: ctx.show }), 'id', (t) =>
                      ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                        ui.a(
                          {
                            href: ui.link(taskPage, { id: t.id }),
                            class: 'flex-1 text-slate-800 hover:underline',
                          },
                          [t.title],
                        ),
                        ui.span(
                          {
                            class: 'rounded-full px-2 py-0.5 text-xs',
                            toggle: {
                              'bg-emerald-100 text-emerald-800': op.eq(t.done, true),
                              'bg-amber-100 text-amber-800': op.eq(t.done, false),
                            },
                          },
                          [ui.if(op.eq(t.done, true), ['done'], ['open'])],
                        ),
                        ui.span(
                          {
                            class: 'rounded-full px-2 py-0.5 text-xs',
                            'data-priority': t.priority,
                            toggle: {
                              'bg-slate-100 text-slate-600': op.eq(t.priority, 'low'),
                              'bg-sky-100 text-sky-800': op.eq(t.priority, 'normal'),
                              'bg-rose-100 text-rose-800': op.eq(t.priority, 'high'),
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
