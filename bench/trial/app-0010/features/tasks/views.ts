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
  NOT_FOUND,
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

export const TasksBoard = ui.view({
  machine: tasksMachine,
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Tasks']),
      ui.form(
        {
          class: 'flex gap-2',
          on: { submit: ui.send(Add, { title: ui.dom.form('title'), priority: ui.dom.form('priority') }) },
        },
        [
          ui.label({ for: 'tasks-title', class: 'sr-only' }, ['New task']),
          ui.input({
            id: 'tasks-title',
            name: 'title',
            required: true,
            minlength: 3,
            maxlength: 80,
            value: ctx.draft,
            'aria-invalid': op.neq(ctx.fields.title, null),
            'aria-describedby': 'tasks-title-error',
            class: 'flex-1 rounded border px-3 py-2',
            on: { input: ui.send(Draft, { text: ui.dom.value }) },
          }),
          ui.select(
            { name: 'priority', 'aria-label': 'Priority', class: 'rounded border px-2' },
            ['low', 'normal', 'high'].map((p) => ui.option({ value: p, selected: p === 'normal' }, [p])),
          ),
          ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),
        ],
      ),
      ui.p({ id: 'tasks-title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error])], []),
      when(['adding'], [ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])]),
      ui.nav(
        { class: 'flex gap-2', 'aria-label': 'Show' },
        shows.map((s) =>
          ui.button(
            {
              type: 'button',
              'aria-pressed': op.eq(ctx.show, s.value),
              class: 'rounded-full border px-3 py-1 aria-pressed:bg-indigo-600 aria-pressed:text-white',
              on: { click: ui.send(SetShow, { show: s.value }) },
            },
            [s.label],
          ),
        ),
      ),
      ui.form({ on: { submit: ui.send(ClearDone, {}) } }, [
        ui.button({ type: 'submit', class: 'text-sm underline' }, ['Clear done']),
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
                ui.ul({ class: 'divide-y rounded-lg border bg-white shadow-sm' }, [
                  ui.each(visible({ items, show: ctx.show }), 'id', (item) =>
                    ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                      ui.a(
                        {
                          href: ui.link(taskPage, { id: item.id }),
                          class: 'flex-1 font-medium text-slate-800 hover:underline',
                        },
                        [item.title],
                      ),
                      ui.span({ class: 'text-xs' }, [item.priority]),
                      ui.span(
                        {
                          class: 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800',
                          toggle: { 'bg-emerald-100 text-emerald-800': op.eq(item.done, true) },
                        },
                        [ui.if(op.eq(item.done, true), ['done'], ['open'])],
                      ),
                      ui.form(
                        { class: 'inline', on: { submit: ui.send(Toggle, { id: ui.dom.form('id') }) } },
                        [
                          ui.input({ type: 'hidden', name: 'id', value: item.id }),
                          ui.button({ type: 'submit', class: 'text-sm underline' }, [
                            ui.if(op.eq(item.done, true), ['Mark open'], ['Mark done']),
                          ]),
                        ],
                      ),
                    ]),
                  ),
                ]),
              ],
            ),
          pending: ui.p({}, ['Loading…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
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
          ready: (item) =>
            ui.article({}, [
              ui.h1({ class: 'text-3xl font-bold' }, [item.title]),
              ui.p({}, ['Status: ', ui.if(op.eq(item.done, true), ['done'], ['open'])]),
              ui.p({}, ['Priority: ', item.priority]),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['Task not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(home, null), class: 'underline' }, ['Back']),
    ]),
})

export const typesDraft = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', changes: { draft: 'Ship' } },
})

export const adds = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Ship', priority: 'normal' } },
    { done: addTask, result: { id: 'x1', title: 'Ship', done: false, priority: 'normal' } },
  ],
  expect: { state: 'idle', effects: [{ effect: addTask, input: { title: 'Ship', priority: 'normal' } }] },
})

export const rejectsDuplicate = contract(tasksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addTask, error: 'Duplicate', data: { title: 'Ship' } }],
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
  expect: { state: 'idle', changes: { fields: { title: 'Use at least 3 characters', priority: null } } },
})

export const addFails = contract(tasksMachine, {
  given: { state: 'adding' },
  when: [{ failed: addTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const toggles = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [
    { send: Toggle, payload: { id: 'x1' } },
    { done: toggleTask, result: { id: 'x1', title: 'Ship', done: true, priority: 'normal' } },
  ],
  expect: {
    state: 'idle',
    changes: { target: 'x1' },
    effects: [{ effect: toggleTask, input: { id: 'x1' } }],
  },
})

export const toggleMissing = contract(tasksMachine, {
  given: { state: 'toggling' },
  when: [{ failed: toggleTask, error: 'NotFound', data: { id: 'x1' } }],
  expect: { state: 'idle', changes: { error: NOT_FOUND } },
})

export const toggleFails = contract(tasksMachine, {
  given: { state: 'toggling' },
  when: [{ failed: toggleTask, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const filters = contract(tasksMachine, {
  given: { state: 'idle' },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', changes: { show: 'done' } },
})

export const clears = contract(tasksMachine, {
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
  intent: { summary: 'Tasks: add one with a title; titles are unique, case-insensitive.' },
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
    adds,
    rejectsDuplicate,
    rejectsInvalid,
    addFails,
    toggles,
    toggleMissing,
    toggleFails,
    filters,
    clears,
    clearFails,
  },
})
