import { machine, on } from '@hozu/core'
import { reversed, todoId } from './effects.ts'
import {
  AddTodo,
  Draft,
  RemoveTodo,
  SelectMetric,
  SelectTab,
  Shuffle,
  SlideChanged,
  ToggleSpin,
} from './events.ts'
import { Context } from './schemas.ts'

export const siteMachine = machine({
  context: Context,
  initialContext: {
    tab: 'design',
    todos: [
      { id: 't1', title: 'Sketch the layout' },
      { id: 't2', title: 'Pick the palette' },
    ],
    draft: '',
    next: 3,
    metric: 'visits',
    slide: 0,
    spin: true,
  },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(SelectTab, {
          target: 'ready',
          assign: (e) => {
            ctx.tab = e.tab
          },
        }),
        on(Draft, {
          target: 'ready',
          assign: (e) => {
            ctx.draft = e.text
          },
        }),
        on(AddTodo, {
          target: 'ready',
          guard: (e) => e.title !== '',
          assign: (e) => {
            ctx.todos.push({ id: todoId(ctx.next), title: e.title })
            ctx.next += 1
            ctx.draft = ''
          },
        }),
        on(RemoveTodo, {
          target: 'ready',
          assign: (e) => {
            ctx.todos = ctx.todos.filter((item) => item.id !== e.id)
          },
        }),
        on(Shuffle, {
          target: 'ready',
          assign: () => {
            ctx.todos = reversed(ctx.todos)
          },
        }),
        on(SelectMetric, {
          target: 'ready',
          guard: (e) => e.metric === 'signups',
          assign: () => {
            ctx.metric = 'signups'
          },
        }),
        on(SelectMetric, {
          target: 'ready',
          assign: () => {
            ctx.metric = 'visits'
          },
        }),
        on(SlideChanged, {
          target: 'ready',
          assign: (e) => {
            ctx.slide = e.index
          },
        }),
        on(ToggleSpin, {
          target: 'ready',
          assign: () => {
            ctx.spin = ctx.spin === false
          },
        }),
      ],
    },
  }),
})
