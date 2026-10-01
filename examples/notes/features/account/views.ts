import { contract, part, ui } from '@hozu/core'
import { login } from '../../routes.ts'
import { Button } from '../../ui/button.ts'
import { Field } from '../../ui/field.ts'
import { Input } from '../../ui/input.ts'
import { accountMachine, accounts, me, SignIn, SignOut, signIn, signOut, text } from './model.ts'

const language = part((locale: string) =>
  ui.a({ href: locale === 'en' ? ui.alternate('de') : ui.alternate('en'), class: 'underline' }, [text.other]),
)

export const Login = ui.view({
  machine: accountMachine,
  route: login,
  render: ({ ctx, locale }) =>
    ui.main({ class: 'mx-auto max-w-sm space-y-6 px-4 py-16' }, [
      language(locale),
      ui.h1({ class: 'text-3xl font-bold' }, [text.signIn]),
      ui.form({ class: 'space-y-3', on: { submit: ui.send(SignIn, { name: ui.dom.form('name') }) } }, [
        ui.use(Field, {
          props: { for: 'name', label: 'Name', error: ctx.fields.name, errorId: 'name-error' },
          slots: {
            control: ui.use(Input, {
              props: {
                id: 'name',
                name: 'name',
                required: true,
                minlength: 2,
                maxlength: 20,
                autocomplete: 'username',
                invalid: ctx.fields.name !== null,
                describedby: 'name-error',
              },
              class: 'w-full',
            }),
          },
        }),
        ui.use(Button, { props: { type: 'submit' }, class: 'w-full' }, [text.signIn]),
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
    ]),
})

export const AccountBar = ui.view({
  machine: accountMachine,
  render: ({ locale }) =>
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
        language(locale),
        ui.form({ on: { submit: ui.send(SignOut, {}) } }, [
          ui.use(Button, { variant: { tone: 'plain' }, props: { type: 'submit' } }, [text.signOut]),
        ]),
      ],
    ),
})

export const Admin = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-8' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Accounts']),
      ui.query(
        accounts,
        {},
        {
          ready: (list) =>
            ui.ul({ class: 'divide-y rounded border' }, [
              ui.each(list, 'name', (a) => ui.li({ class: 'px-4 py-2' }, [a.name, ': ', a.notes, ' notes'])),
            ]),
          failed: {
            Unauthorized: () => ui.p({ role: 'alert' }, ['Signed out']),
            Forbidden: () => ui.p({ role: 'alert' }, ['Admins only']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']),
          },
        },
      ),
    ]),
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

export const signsOut = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignOut, payload: {} },
    { done: signOut, result: {} },
  ],
  expect: { state: 'idle', effects: [{ effect: signOut, input: {} }, { navigate: '/login' }] },
})
