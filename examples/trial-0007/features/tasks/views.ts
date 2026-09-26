import { contract, feature, op, ui } from '@tenonkit/core'
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

const priorities = ['low', 'normal', 'high'] as const

const shows = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
] as const

export const Board = ui.view({
  machine: tasksMachine,
  route: home,
  render: ({ ctx }) =>
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
            class:
              'flex-1 rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none',
            on: { input: ui.send(Draft, { text: ui.dom.value }) },
          }),
          ui.label({ for: 'priority', class: 'sr-only' }, ['Priority']),
          ui.select(
            {
              id: 'priority',
              name: 'priority',
              class: 'rounded-lg border border-slate-300 px-2 py-2 shadow-sm',
            },
            priorities.map((p) => ui.option({ value: p, selected: p === 'normal' }, [p])),
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
      ui.if(
        op.neq(ctx.error, null),
        [
          ui.p({ role: 'alert', class: 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700' }, [
            ctx.error,
          ]),
        ],
        [],
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
      ui.button(
        {
          type: 'button',
          class: 'rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50',
          on: { click: ui.send(ClearDone, {}) },
        },
        ['Clear done'],
      ),
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
                            class: 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700',
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
            Unexpected: () => ui.p({ role: 'alert' }, ['Task unavailable']),
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

export const setsFilter = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', changes: { show: 'done' } },
})

export const addsTask = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Test it', priority: 'high' } },
    { send: Draft, payload: { text: 'ignored while adding' } },
    { done: addTask, result: { id: 't4', title: 'Test it', done: false, priority: 'high' } },
  ],
  expect: {
    state: 'idle',
    changes: { priority: 'high' },
    effects: [{ effect: addTask, input: { title: 'Test it', priority: 'high' } }],
  },
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
      data: { message: 'title: Use at least 3 characters', fields: { title: 'Use at least 3 characters' } },
    },
  ],
  expect: { state: 'idle', changes: { error: 'title: Use at least 3 characters' } },
})

export const addFails = contract(tasksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const togglesTask = contract(tasksMachine, {
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
    { send: Toggle, payload: { id: 't2' } },
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
    summary: 'A task board: add tasks, toggle them done, filter in the browser, one page each.',
    invariants: ['Titles are unique, case-insensitive, after trimming', 'New tasks are listed first'],
  },
  declarations: {
    tasksTag,
    Draft,
    Add,
    Toggle,
    SetShow,
    ClearDone,
    listTasks,
    getTask,
    addTask,
    toggleTask,
    clearDone,
    visible,
    isEmpty,
    tasksMachine,
    Board,
    Detail,
    typesDraft,
    setsFilter,
    addsTask,
    rejectsDuplicate,
    rejectsInvalid,
    addFails,
    togglesTask,
    toggleMissing,
    toggleFails,
    clearsDone,
    clearFails,
  },
})
