import { event, invoke, machine, on, op } from '@tenonkit/core'
import { z } from 'zod'
import { savePost, unsavePost } from './effects.ts'

export const Save = event({ payload: z.object({ slug: z.string() }) })
export const Unsave = event({ payload: z.object({ slug: z.string() }) })

export const savedMachine = machine({
  context: z.object({ slug: z.string(), error: z.string().nullable() }),
  initialContext: { slug: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Save, { target: 'saving', assign: (p) => [op.set(ctx.slug, p.slug), op.set(ctx.error, null)] }),
        on(Unsave, {
          target: 'removing',
          assign: (p) => [op.set(ctx.slug, p.slug), op.set(ctx.error, null)],
        }),
      ],
    },
    saving: {
      invoke: invoke(savePost, {
        input: { slug: ctx.slug },
        done: [{ target: 'idle' }],
        failed: {
          LimitReached: [{ target: 'idle', assign: () => [op.set(ctx.error, 'Reading list is full')] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    removing: {
      invoke: invoke(unsavePost, {
        input: { slug: ctx.slug },
        done: [{ target: 'idle' }],
        failed: { Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }] },
      }),
    },
  }),
})
