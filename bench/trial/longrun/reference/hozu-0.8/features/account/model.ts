import { endpoint, event, invoke, machine, mutation, on, query, ui } from '@hozu/core'
import { z } from 'zod'
import { list, login } from '../../routes.ts'

export const Session = z.object({ user: z.string() })
export type Session = z.infer<typeof Session>
export const Name = z.object({
  name: z.string().regex(/^\s*[A-Za-z]{2,20}\s*$/, 'Use 2–20 letters'),
})

export const SignIn = event({ payload: z.object({ name: z.string() }) })
export const SignOut = event({ payload: z.object({}) })
export const DeleteAccount = event({ payload: z.object({}) })

export const me = query({
  input: z.object({}),
  output: z.object({ name: z.string() }),
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'request',
})

export const landing = endpoint({ method: 'GET', path: '/', input: z.object({}), output: 'redirect' })

export const ADMIN = 'admin'

export const accounts = query({
  input: z.object({}),
  output: z.array(z.object({ user: z.string(), notes: z.number() })),
  errors: { Unauthorized: z.object({}), Forbidden: z.object({}) },
  scope: 'user',
  freshness: 'request',
})

export const text = ui.messages('en', {
  en: { signIn: 'Sign in', signedInAs: 'Signed in as {name}', signOut: 'Sign out', other: 'Deutsch' },
  de: { signIn: 'Anmelden', signedInAs: 'Angemeldet als {name}', signOut: 'Abmelden', other: 'English' },
})

export const signIn = mutation({ input: Name, output: z.object({}) })
export const signOut = mutation({ input: z.object({}), output: z.object({}) })
export const deleteAccount = mutation({ input: z.object({}), output: z.object({}) })

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
        on(DeleteAccount, { target: 'deleting' }),
      ],
    },
    signingIn: {
      invoke: invoke(signIn, {
        input: { name: ctx.draft },
        done: [{ target: 'idle', navigate: () => ui.link(list, null) }],
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
    deleting: {
      invoke: invoke(deleteAccount, {
        input: {},
        done: { target: 'idle', navigate: () => ui.link(login, null, { deleted: true }) },
        failed: {
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
  }),
})
