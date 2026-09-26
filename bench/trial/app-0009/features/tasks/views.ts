import { contract, feature, op, ui } from '@hozu/core'
import { home, taskPage } from '../../routes.ts'
import {
  Add,
  addTask,
  ClearDone,
  clearDone,
  Draft,
  DUPLICATE,
  getTask,
  isEmpty,
  listTasks,
  SetShow,
  Toggle,
  tasksMachine,
  tasksTag,
  toggleTask,
  visible,
} from './model.ts'

const shows = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
] as const

const priorities = ['low', 'normal', 'high'] as const

export const TasksBoard = ui.view({
  machine: tasksMachine,
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold tracking-tight text-slate-900' }, ['Tasks']),
      ui.form(
        {
          class: 'flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
          on: { submit: ui.send(Add, { title: ui.dom.form('title'), priority: ui.dom.form('priority') }) },
        },
        [
          ui.div({ class: 'flex flex-1 flex-col gap-1' }, [
            ui.label({ for: 'new-task', class: 'text-sm font-medium text-slate-700' }, ['New task']),
            ui.input({
              id: 'new-task',
              name: 'title',
              type: 'text',
              required: true,
              minlength: 3,
              maxlength: 80,
              pattern: '\\s*\\S.{1,}\\S\\s*',
              value: ctx.draft,
              'aria-invalid': op.neq(ctx.fields.title, null),
              'aria-describedby': 'new-task-error',
              class:
                'rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none',
              on: { input: ui.send(Draft, { text: ui.dom.value }) },
            }),
          ]),
          ui.select(
            {
              name: 'priority',
              'aria-label': 'Priority',
              class:
                'rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none',
            },
            priorities.map((p) => ui.option({ value: p, selected: op.eq(ctx.priority, p) }, [p])),
          ),
          ui.button(
            {
              type: 'submit',
              class: 'rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700',
            },
            ['Add'],
          ),
        ],
      ),
      ui.p({ id: 'new-task-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
      ui.if(
        op.neq(ctx.error, null),
        [ui.p({ role: 'alert', class: 'rounded-lg bg-rose-50 px-4 py-2 text-rose-700' }, [ctx.error])],
        [],
      ),
      when(
        ['adding'],
        [ui.p({ class: 'text-slate-500 opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])],
      ),
      ui.div(
        { class: 'flex gap-2', role: 'group', 'aria-label': 'Filter' },
        shows.map((s) =>
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
      ),
      ui.form({ on: { submit: ui.send(ClearDone, {}) } }, [
        ui.button(
          { type: 'submit', class: 'rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50' },
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
                              'bg-slate-100 text-slate-600': op.eq(t.priority, 'low'),
                              'bg-sky-100 text-sky-700': op.eq(t.priority, 'normal'),
                              'bg-rose-100 text-rose-700': op.eq(t.priority, 'high'),
                            },
                          },
                          [t.priority],
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
                        ui.form({ on: { submit: ui.send(Toggle, { id: ui.dom.form('id') }) } }, [
                          ui.input({ type: 'hidden', name: 'id', value: t.id }),
                          ui.button(
                            {
                              type: 'submit',
                              class: 'rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50',
                            },
                            [ui.if(op.eq(t.done, true), ['Mark open'], ['Mark done'])],
                          ),
                        ]),
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

export const TaskDetail = ui.view({
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

export const typesDraft = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', changes: { draft: 'Ship' } },
})

export const filters = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', changes: { show: 'done' } },
})

export const adds = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Ship', priority: 'high' } },
    { send: SetShow, payload: { show: 'open' } },
    { done: addTask, result: { id: 't4', title: 'Ship', done: false, priority: 'high' } },
  ],
  expect: { state: 'idle', effects: [{ effect: addTask, input: { title: 'Ship', priority: 'high' } }] },
})

export const rejectsDuplicate = contract(tasksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addTask, error: 'Duplicate', data: { title: 'Ship it' } }],
  expect: { state: 'idle', changes: { error: DUPLICATE } },
})

export const rejectsInvalid = contract(tasksMachine, {
  given: { state: 'adding' },
  when: [
    {
      failed: addTask,
      error: 'Invalid',
      data: {
        message: 'title: Use at least 3 characters',
        fields: { title: 'Use at least 3 characters', priority: null },
      },
    },
  ],
  expect: { state: 'idle', changes: { fields: { title: 'Use at least 3 characters' } } },
})

export const addFails = contract(tasksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const toggles = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [
    { send: Toggle, payload: { id: 't2' } },
    { done: toggleTask, result: { id: 't2', title: 'Build the app', done: true, priority: 'normal' } },
  ],
  expect: {
    state: 'idle',
    changes: { target: 't2' },
    effects: [{ effect: toggleTask, input: { id: 't2' } }],
  },
})

export const toggleMissing = contract(tasksMachine, {
  given: { state: 'toggling' },
  when: [{ failed: toggleTask, error: 'NotFound', data: { id: 't9' } }],
  expect: { state: 'idle' },
})

export const toggleFails = contract(tasksMachine, {
  given: { state: 'toggling' },
  when: [{ failed: toggleTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const clearsDone = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [
    { send: ClearDone, payload: {} },
    { done: clearDone, result: { removed: 1 } },
  ],
  expect: { state: 'idle', effects: [{ effect: clearDone, input: {} }] },
})

export const clearFails = contract(tasksMachine, {
  given: { state: 'clearing' },
  when: [{ failed: clearDone, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const tasks = feature({
  id: 'tasks',
  intent: {
    summary:
      'A task board: add tasks with a priority, toggle them open/done, clear done tasks, filter in the browser, one page per task.',
    invariants: ['Titles are unique, case-insensitive, after trimming', 'New tasks are listed first'],
  },
  declarations: {
    Draft,
    Add,
    Toggle,
    SetShow,
    ClearDone,
    tasksTag,
    listTasks,
    getTask,
    addTask,
    toggleTask,
    clearDone,
    visible,
    isEmpty,
    tasksMachine,
    TasksBoard,
    TaskDetail,
    typesDraft,
    filters,
    adds,
    rejectsDuplicate,
    rejectsInvalid,
    addFails,
    toggles,
    toggleMissing,
    toggleFails,
    clearsDone,
    clearFails,
  },
})
