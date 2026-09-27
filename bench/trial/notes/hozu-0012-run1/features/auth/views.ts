import { contract, feature, op, ui } from '@hozu/core'
import { authMachine, SignIn, signIn, whoami } from './model.ts'

export const SignInForm = ui.view({
  machine: authMachine,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-sm space-y-6 px-4 py-16' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Sign in']),
      ui.form({ class: 'space-y-3', on: { submit: ui.send(SignIn, { name: ui.dom.form('name') }) } }, [
        ui.label({ for: 'name', class: 'block text-sm font-medium text-slate-700' }, ['Name']),
        ui.input({
          id: 'name',
          name: 'name',
          type: 'text',
          required: true,
          minlength: 2,
          maxlength: 20,
          pattern: '[A-Za-z]{2,20}',
          autocomplete: 'username',
          value: ctx.name,
          'aria-invalid': op.neq(ctx.fields.name, null),
          'aria-describedby': 'name-error',
          class: 'w-full rounded border border-slate-300 px-3 py-2',
        }),
        ui.p({ id: 'name-error', class: 'text-sm text-rose-600' }, [ctx.fields.name]),
        ui.button(
          { type: 'submit', class: 'w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white' },
          ['Sign in'],
        ),
      ]),
      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error])], []),
    ]),
})

export const signsIn = contract(authMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignIn, payload: { name: 'ada' } },
    { send: SignIn, payload: { name: 'ignored' } },
    { done: signIn, result: { name: 'ada' } },
  ],
  expect: {
    state: 'idle',
    changes: { name: 'ada' },
    effects: [{ effect: signIn, input: { name: 'ada' } }, { navigate: '/' }],
  },
})

export const rejectsInvalidName = contract(authMachine, {
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

export const signInFails = contract(authMachine, {
  given: { state: 'signingIn' },
  when: [{ failed: signIn, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})

export const auth = feature({
  id: 'auth',
  intent: {
    summary: 'Sign in with a name only (2–20 letters); the user is kept in an HttpOnly session cookie.',
  },
  exports: [whoami],
  declarations: { SignIn, whoami, signIn, authMachine, SignInForm, signsIn, rejectsInvalidName, signInFails },
})
