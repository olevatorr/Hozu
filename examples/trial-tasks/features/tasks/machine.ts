import { invoke, machine, on } from '@hozu/core'
import { addTask, clearDone, toggleTask } from './effects.ts'
import { Add, ClearDone, Draft, SetShow, Toggle } from './events.ts'
import { Context } from './schemas.ts'

export const DUPLICATE = 'A task with this title already exists'
export const INVALID = 'Titles must be 3 to 80 characters'

export const tasksMachine = machine({
  context: Context,
  initialContext: { show: 'all', draft: '', priority: 'normal', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SetShow, {
          target: 'idle',
          assign: (e) => {
            ctx.show = e.show
          },
        }),
        on(Draft, {
          target: 'idle',
          assign: (e) => {
            ctx.draft = e.text
          },
        }),
        on(Add, {
          target: 'adding',
          assign: (e) => {
            ctx.draft = e.title
            ctx.priority = e.priority
            ctx.error = null
          },
        }),
        on(Toggle, {
          target: 'toggling',
          assign: (e) => {
            ctx.target = e.id
          },
        }),
        on(ClearDone, {
          target: 'clearing',
          assign: () => {
            ctx.error = null
          },
        }),
      ],
    },
    adding: {
      invoke: invoke(addTask, {
        input: { title: ctx.draft, priority: ctx.priority },
        done: [
          {
            target: 'idle',
            assign: () => {
              ctx.draft = ''
            },
          },
        ],
        failed: {
          Duplicate: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = DUPLICATE
              },
            },
          ],
          Invalid: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = INVALID
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    toggling: {
      invoke: invoke(toggleTask, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle' }],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    clearing: {
      invoke: invoke(clearDone, {
        input: {},
        done: [{ target: 'idle' }],
        failed: {
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
  }),
})
