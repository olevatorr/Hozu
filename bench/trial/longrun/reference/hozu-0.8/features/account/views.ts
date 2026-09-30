import { contract, part, ui } from '@hozu/core'
import { accountDelete, admin, login } from '../../routes.ts'
import {
  ADMIN,
  accountMachine,
  accounts,
  DeleteAccount,
  deleteAccount,
  me,
  SignIn,
  SignOut,
  signIn,
  signOut,
  text,
} from './model.ts'

export const languageSwitch = part((locale: string) =>
  ui.a({ href: locale === 'en' ? ui.alternate('de') : ui.alternate('en'), class: 'underline' }, [text.other]),
)

export const Login = ui.view({
  machine: accountMachine,
  route: login,
  render: ({ ctx, search, locale }) =>
    ui.main({ class: 'mx-auto max-w-sm space-y-6 px-4 py-16' }, [
      languageSwitch(locale),
      ui.h1({ class: 'text-3xl font-bold' }, [text.signIn]),
      search.deleted && ui.p({ role: 'status', class: 'text-slate-600' }, ['Account deleted']),
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
          text.signIn,
        ]),
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
            ready: (user) =>
              ui.p({ class: 'flex gap-3' }, [
                text.signedInAs({ name: user.name }),
                user.name === ADMIN && ui.a({ href: ui.link(admin, null), class: 'underline' }, ['Admin']),
              ]),
            pending: null,
            failed: { Unauthorized: () => ui.p({}, ['Signed out']), Unexpected: () => ui.p({}, ['']) },
          },
        ),
        ui.a({ href: ui.link(accountDelete, null), class: 'underline' }, ['Delete account']),
        languageSwitch(locale),
        ui.form({ on: { submit: ui.send(SignOut, {}) } }, [
          ui.button({ type: 'submit', class: 'underline' }, [text.signOut]),
        ]),
      ],
    ),
})

export const AdminBoard = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-8' }, [
      ui.query(
        accounts,
        {},
        {
          ready: (rows) =>
            ui.div({ class: 'space-y-4' }, [
              ui.h1({ class: 'text-3xl font-bold' }, ['Admin']),
              ui.table({ class: 'w-full text-left' }, [
                ui.thead({}, [ui.tr({}, [ui.th({}, ['User']), ui.th({}, ['Notes'])])]),
                ui.tbody({}, [
                  ui.each(rows, 'user', (row) => ui.tr({}, [ui.td({}, [row.user]), ui.td({}, [row.notes])])),
                ]),
              ]),
            ]),
          failed: {
            Unauthorized: () => ui.p({ role: 'alert' }, ['Signed out']),
            Forbidden: () => ui.h1({ class: 'text-3xl font-bold' }, ['Not allowed']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']),
          },
        },
      ),
    ]),
})

export const DeleteAccountPage = ui.view({
  machine: accountMachine,
  route: accountDelete,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-sm space-y-6 px-4 py-16' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Delete account']),
      ui.p({ class: 'text-slate-600' }, ['This deletes all of your notes, archived ones included.']),
      ui.form({ on: { submit: ui.send(DeleteAccount, {}) } }, [
        ui.button({ type: 'submit', class: 'w-full rounded bg-rose-600 px-4 py-2 text-white' }, [
          'Delete my account and notes',
        ]),
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
    ]),
})

export const signsInToList = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignIn, payload: { name: 'ada' } },
    { done: signIn, result: {} },
  ],
  expect: {
    state: 'idle',
    changes: { draft: 'ada' },
    effects: [{ effect: signIn, input: { name: 'ada' } }, { navigate: '/notes' }],
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

export const signsOutToLogin = contract(accountMachine, {
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

export const deletesAccount = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: DeleteAccount, payload: {} },
    { done: deleteAccount, result: {} },
  ],
  expect: {
    state: 'idle',
    effects: [{ effect: deleteAccount, input: {} }, { navigate: '/login?deleted=true' }],
  },
})
