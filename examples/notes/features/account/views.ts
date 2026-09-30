import { contract, ui } from '@hozu/core'
import { login } from '../../routes.ts'
import { accountMachine, me, SignIn, SignOut, signIn, signOut } from './model.ts'

export const Login = ui.view({
  machine: accountMachine,
  route: login,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-sm space-y-6 px-4 py-16' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Sign in']),
      ui.form({ class: 'space-y-3', on: { submit: ui.send(SignIn, { name: ui.dom.form('name') }) } }, [
        ui.label({ for: 'name', class: 'block text-sm font-medium' }, ['Name']),
        ui.input({
          id: 'name',
          name: 'name',
          required: true,
          minlength: 2,
          maxlength: 20,
          autocomplete: 'username',
          'aria-invalid': ctx.fields.name !== null,
          'aria-describedby': 'name-error',
          class: 'w-full rounded border px-3 py-2',
        }),
        ui.p({ id: 'name-error', class: 'text-sm text-rose-600' }, [ctx.fields.name]),
        ui.button({ type: 'submit', class: 'w-full rounded bg-indigo-600 px-4 py-2 text-white' }, [
          'Sign in',
        ]),
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
    ]),
})

export const AccountBar = ui.view({
  machine: accountMachine,
  render: () =>
    ui.header(
      { class: 'mx-auto flex max-w-xl items-center justify-between px-4 pt-8 text-sm text-slate-600' },
      [
        ui.query(
          me,
          {},
          {
            ready: (user) => ui.p({}, ['Signed in as ', user.name]),
            pending: null,
            failed: { Unauthorized: () => ui.p({}, ['Signed out']), Unexpected: () => ui.p({}, ['']) },
          },
        ),
        ui.form({ on: { submit: ui.send(SignOut, {}) } }, [
          ui.button({ type: 'submit', class: 'underline' }, ['Sign out']),
        ]),
      ],
    ),
})

export const signsIn = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignIn, payload: { name: 'ada' } },
    { done: signIn, result: {} },
  ],
  expect: {
    state: 'idle',
    changes: { draft: 'ada' },
    effects: [{ effect: signIn, input: { name: 'ada' } }, { navigate: '/' }],
  },
})

export const rejectsName = contract(accountMachine, {
  given: { state: 'signingIn' },
  when: [
    {
      failed: signIn,
      error: 'Invalid',
      data: { message: 'name: Use 2–20 letters', fields: { name: 'Use 2–20 letters' } },
    },
  ],
  expect: { state: 'idle', changes: { fields: { name: 'Use 2–20 letters' } } },
})

export const signInFails = contract(accountMachine, {
  given: { state: 'signingIn' },
  when: [{ failed: signIn, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const signsOut = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignOut, payload: {} },
    { done: signOut, result: {} },
  ],
  expect: { state: 'idle', effects: [{ effect: signOut, input: {} }, { navigate: '/login' }] },
})

export const signOutFails = contract(accountMachine, {
  given: { state: 'signingOut' },
  when: [{ failed: signOut, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})
