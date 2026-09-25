import { op, type Ref, ui } from '@tenon/core'
import type { z } from 'zod'
import { home, taskPage } from '../../routes.ts'
import { getTask, listTasks, noneVisible, visibleTasks } from './effects.ts'
import { AddTask, ClearDone, Draft, SetFilter, SetPriority, ToggleTask } from './events.ts'
import { tasksMachine } from './machine.ts'
import type { Filter as FilterSchema, Priority as PrioritySchema, Task as TaskSchema } from './schemas.ts'

type Task = z.infer<typeof TaskSchema>
type Filter = z.infer<typeof FilterSchema>
type Priority = z.infer<typeof PrioritySchema>

const priorities = ['low', 'normal', 'high'] as const

const filters = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
] as const

const shell = 'mx-auto max-w-xl px-4 py-12 font-sans text-slate-900'
const badge = 'rounded-full px-2 py-0.5 text-xs font-medium'

const toggleButton = (task: Ref<Task>, live: boolean) =>
  ui.button(
    {
      type: 'button',
      disabled: !live,
      class:
        'rounded-md border border-slate-300 px-2 py-1 text-xs transition hover:bg-slate-100 disabled:opacity-60',
      ...(live ? { on: { click: ui.send(ToggleTask, { id: task.id }) } } : {}),
    },
    [ui.if(op.eq(task.done, true), ['Mark open'], ['Mark done'])],
  )

const addForm = (draft: Ref<string>, priority: Ref<Priority>, live: boolean) =>
  ui.form(
    {
      class: 'mb-2 flex items-end gap-2',
      ...(live ? { on: { submit: ui.send(AddTask, { title: ui.dom.form('title') }) } } : {}),
    },
    [
      ui.div({ class: 'flex min-w-0 flex-1 flex-col gap-1' }, [
        ui.label({ for: 'new-task', class: 'text-sm font-medium text-slate-600' }, ['New task']),
        ui.input({
          id: 'new-task',
          name: 'title',
          type: 'text',
          required: true,
          minlength: 3,
          maxlength: 80,
          pattern: '\\s*\\S.{1,78}\\S\\s*',
          autocomplete: 'off',
          readonly: !live,
          value: draft,
          class:
            'rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20',
          ...(live ? { on: { input: ui.send(Draft, { text: ui.dom.value }) } } : {}),
        }),
      ]),
      ui.div({ class: 'flex flex-col gap-1' }, [
        ui.label({ for: 'new-priority', class: 'text-sm font-medium text-slate-600' }, ['Priority']),
        ui.select(
          {
            id: 'new-priority',
            name: 'priority',
            disabled: !live,
            class:
              'rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20',
            ...(live ? { on: { change: ui.send(SetPriority, { priority: ui.dom.value }) } } : {}),
          },
          priorities.map((p) => ui.option({ value: p, selected: op.eq(priority, p) }, [p])),
        ),
      ]),
      ui.button(
        {
          type: 'submit',
          disabled: !live,
          class:
            'rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60',
        },
        ['Add'],
      ),
    ],
  )

const clearButton = (live: boolean) =>
  ui.button(
    {
      type: 'button',
      disabled: !live,
      class:
        'ml-auto rounded-full border border-rose-300 px-3 py-1 text-sm text-rose-700 transition hover:bg-rose-50 disabled:opacity-60',
      ...(live ? { on: { click: ui.send(ClearDone, {}) } } : {}),
    },
    ['Clear done'],
  )

const filterBar = (filter: Ref<Filter>, live: boolean) =>
  ui.div({ class: 'my-6 flex items-center gap-2' }, [
    ui.div({ class: 'flex gap-2', role: 'group', 'aria-label': 'Filter' }, [
      ...filters.map((f) =>
        ui.button(
          {
            type: 'button',
            disabled: !live,
            'aria-pressed': op.eq(filter, f.value),
            class:
              'rounded-full border border-slate-300 px-3 py-1 text-sm transition hover:border-indigo-500 aria-pressed:border-indigo-600 aria-pressed:bg-indigo-600 aria-pressed:text-white',
            ...(live ? { on: { click: ui.send(SetFilter, { filter: f.value }) } } : {}),
          },
          [f.label],
        ),
      ),
    ]),
    clearButton(live),
  ])

export const Board = ui.view({
  machine: tasksMachine,
  route: null,
  render: ({ ctx, when }) =>
    ui.main({ class: shell }, [
      ui.h1({ class: 'mb-8 text-4xl font-bold tracking-tight' }, ['Tasks']),
      when(['idle'], [addForm(ctx.draft, ctx.priority, true), filterBar(ctx.filter, true)]),
      when(
        ['adding', 'toggling', 'clearing'],
        [addForm(ctx.draft, ctx.priority, false), filterBar(ctx.filter, false)],
      ),
      ui.if(
        op.neq(ctx.error, null),
        [ui.p({ role: 'alert', class: 'mb-2 text-sm text-rose-600' }, [ctx.error])],
        [],
      ),
      ui.query(
        listTasks,
        {},
        {
          ready: (tasks) =>
            ui.if(
              noneVisible({ tasks, filter: ctx.filter }),
              [ui.p({ class: 'text-slate-500' }, ['No tasks'])],
              [
                ui.ul(
                  {
                    class: 'divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm',
                  },
                  [
                    ui.each(visibleTasks({ tasks, filter: ctx.filter }), 'id', (task) =>
                      ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                        ui.a(
                          {
                            href: ui.link(taskPage, { id: task.id }),
                            class: 'flex-1 font-medium hover:text-indigo-600',
                          },
                          [task.title],
                        ),
                        ui.span(
                          {
                            class: badge,
                            toggle: {
                              'bg-emerald-100 text-emerald-700': op.eq(task.done, true),
                              'bg-amber-100 text-amber-700': op.eq(task.done, false),
                            },
                          },
                          [ui.if(op.eq(task.done, true), ['done'], ['open'])],
                        ),
                        ui.span(
                          {
                            class: badge,
                            'data-priority': task.priority,
                            toggle: {
                              'bg-rose-100 text-rose-700': op.eq(task.priority, 'high'),
                              'bg-sky-100 text-sky-700': op.eq(task.priority, 'normal'),
                              'bg-slate-100 text-slate-600': op.eq(task.priority, 'low'),
                            },
                          },
                          [task.priority],
                        ),
                        when(['idle'], [toggleButton(task, true)]),
                        when(['adding', 'toggling', 'clearing'], [toggleButton(task, false)]),
                      ]),
                    ),
                  ],
                ),
              ],
            ),
          pending: ui.p({}, ['Loading tasks…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Tasks are unavailable']) },
        },
      ),
    ]),
})

export const Detail = ui.view({
  machine: null,
  route: taskPage,
  render: ({ params }) =>
    ui.main({ class: shell }, [
      ui.query(
        getTask,
        { id: params.id },
        {
          ready: (task) =>
            ui.article({ class: 'mb-8 space-y-2' }, [
              ui.h1({ class: 'text-4xl font-bold tracking-tight' }, [task.title]),
              ui.p({ class: 'text-slate-600' }, [
                'Status: ',
                ui.if(op.eq(task.done, true), ['done'], ['open']),
              ]),
              ui.p({ class: 'text-slate-600' }, ['Priority: ', task.priority]),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert', class: 'mb-8 text-lg text-rose-600' }, ['Task not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Task unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(home, null), class: 'text-indigo-600 hover:underline' }, ['Back']),
    ]),
})
