import { event, invoke, machine, mutation, on, query, ui } from '@hozu/core'
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
  freshness: 'request',
  runs: 'server',
})

export const ADMIN = 'admin'

export const accounts = query({
  input: z.object({}),
  output: z.array(z.object({ name: z.string(), notes: z.number() })),
  errors: { Unauthorized: z.object({}), Forbidden: z.object({}) },
  scope: 'user',
  freshness: 'request',
  runs: 'server',
})

export const signIn = mutation({ input: Name, output: z.object({}), runs: 'server' })
export const signOut = mutation({ input: z.object({}), output: z.object({}), runs: 'server' })

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
          assign: (e) => {
            ctx.draft = e.name
            ctx.error = null
            ctx.fields = { name: null }
          },
        }),
        on(SignOut, { target: 'signingOut' }),
      ],
    },
    signingIn: {
      invoke: invoke(signIn, {
        input: { name: ctx.draft },
        done: [{ target: 'idle', navigate: () => ui.link(home, null) }],
        failed: {
          Invalid: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.fields = e.fields
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
    signingOut: {
      invoke: invoke(signOut, {
        input: {},
        done: [{ target: 'idle', navigate: () => ui.link(login, null) }],
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

export const text = ui.messages('en', {
  en: { signIn: 'Sign in', signOut: 'Sign out', other: 'Deutsch' },
  de: { signIn: 'Anmelden', signOut: 'Abmelden', other: 'English' },
})
