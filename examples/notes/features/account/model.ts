import { event, invoke, machine, mutation, on, op, query, ui } from '@hozu/core'
import { z } from 'zod'
import { home, login } from '../../routes.ts'

export const Session = z.object({ user: z.string() })
export const Name = z.object({
  name: z.string().regex(/^\s*[A-Za-z]{2,20}\s*$/, 'Use 2–20 letters'),
})

export const SignIn = event({ payload: z.object({ name: z.string() }) })
export const SignOut = event({ payload: z.object({}) })

export const me = query({
  input: z.object({}),
  output: z.object({ name: z.string() }),
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'static',
})

export const signIn = mutation({ input: Name, output: z.object({}) })
export const signOut = mutation({ input: z.object({}), output: z.object({}) })

export const accountMachine = machine({
  context: z.object({
    draft: z.string(),
    error: z.string().nullable(),
    fields: z.object({ name: z.string().nullable() }),
  }),
  initialContext: { draft: '', error: null, fields: { name: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SignIn, {
          target: 'signingIn',
          assign: (e) => [
            op.set(ctx.draft, e.name),
            op.set(ctx.error, null),
            op.set(ctx.fields, { name: null }),
          ],
        }),
        on(SignOut, { target: 'signingOut' }),
      ],
    },
    signingIn: {
      ignore: [SignIn, SignOut],
      invoke: invoke(signIn, {
        input: { name: ctx.draft },
        done: [{ target: 'idle', navigate: () => ui.link(home, null) }],
        failed: {
          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    signingOut: {
      ignore: [SignIn, SignOut],
      invoke: invoke(signOut, {
        input: {},
        done: [{ target: 'idle', navigate: () => ui.link(login, null) }],
        failed: { Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }] },
      }),
    },
  }),
})
