import { event, invoke, machine, mutation, on, op, query, ui } from '@hozu/core'
import { z } from 'zod'
import { home } from '../../routes.ts'

export const User = z.object({ name: z.string() })

export const SignIn = event({ payload: z.object({ name: z.string() }) })

export const whoami = query({
  input: z.object({}),
  output: User,
  errors: { SignedOut: z.object({}) },
  scope: 'user',
  freshness: 'live',
})

export const signIn = mutation({
  input: z.object({
    name: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2,20}$/, 'Use 2–20 letters'),
  }),
  output: User,
})

export const authMachine = machine({
  context: z.object({
    name: z.string(),
    fields: z.object({ name: z.string().nullable() }),
    error: z.string().nullable(),
  }),
  initialContext: { name: '', fields: { name: null }, error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SignIn, {
          target: 'signingIn',
          assign: (e) => [
            op.set(ctx.name, e.name),
            op.set(ctx.fields, { name: null }),
            op.set(ctx.error, null),
          ],
        }),
      ],
    },
    signingIn: {
      ignore: [SignIn],
      invoke: invoke(signIn, {
        input: { name: ctx.name },
        done: [{ target: 'idle', navigate: () => ui.link(home, null) }],
        failed: {
          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
  }),
})
