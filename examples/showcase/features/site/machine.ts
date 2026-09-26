import { machine, on, op } from '@tenonkit/core'
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
        on(SelectTab, { target: 'ready', assign: (e) => [op.set(ctx.tab, e.tab)] }),
        on(Draft, { target: 'ready', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(AddTodo, {
          target: 'ready',
          guard: (e) => op.neq(e.title, ''),
          assign: (e) => [
            op.append(ctx.todos, { id: todoId(ctx.next), title: e.title }),
            op.inc(ctx.next, 1),
            op.set(ctx.draft, ''),
          ],
        }),
        on(RemoveTodo, { target: 'ready', assign: (e) => [op.removeWhere(ctx.todos, 'id', e.id)] }),
        on(Shuffle, { target: 'ready', assign: () => [op.set(ctx.todos, reversed(ctx.todos))] }),
        on(SelectMetric, {
          target: 'ready',
          guard: (e) => op.eq(e.metric, 'signups'),
          assign: () => [op.set(ctx.metric, 'signups')],
        }),
        on(SelectMetric, { target: 'ready', assign: () => [op.set(ctx.metric, 'visits')] }),
        on(SlideChanged, { target: 'ready', assign: (e) => [op.set(ctx.slide, e.index)] }),
        on(ToggleSpin, { target: 'ready', assign: () => [op.set(ctx.spin, op.eq(ctx.spin, false))] }),
      ],
    },
  }),
})
