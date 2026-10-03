import { ui } from '@hozu/core'
import { home } from '../../routes.ts'
import {
  AddNote,
  ClearDrafts,
  CreatePost,
  drafts,
  labMachine,
  listNotes,
  person,
  posts,
  SaveDraft,
} from './model.ts'

const card = 'space-y-3 rounded-lg border border-slate-200 p-5'
const badge = 'rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600'
const field = 'flex-1 rounded border border-slate-300 px-2 py-1'
const button = 'rounded bg-slate-900 px-3 py-1 text-sm text-white'
const users = ['1', '2', '3'] as const

export const Lab = ui.view({
  machine: labMachine,
  route: home,
  seed: ({ search }) => ({ user: search.user }),
  render: ({ ctx, search, when }) =>
    ui.main({ class: 'mx-auto max-w-3xl space-y-6 px-4 py-10' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['API playground']),
      ui.p({ class: 'text-slate-600' }, [
        'One query and mutation of each kind. Open the API tab in the DevTools dock to run them with your own input.',
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-red-700' }, [ctx.error]),
      when(
        ['addingNote', 'creatingPost', 'savingDraft', 'clearingDrafts'],
        [ui.p({ 'aria-busy': 'true', class: 'text-slate-500' }, ['Working…'])],
      ),

      ui.section({ class: card, 'aria-label': 'On your server' }, [
        ui.h2({ class: 'text-xl font-semibold' }, [
          'On your server ',
          ui.span({ class: badge }, ["runs: 'server'"]),
        ]),
        ui.p({ class: 'text-sm text-slate-600' }, [
          'Data in app.ts, and an external API called from the server (where a secret key would live).',
        ]),
        ui.query(
          listNotes,
          {},
          {
            ready: (notes) =>
              ui.ul({ class: 'list-disc pl-5' }, [ui.each(notes, 'id', (n) => ui.li({}, [n.text]))]),
            failed: { Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]) },
          },
        ),
        ui.form({ class: 'flex gap-2', on: { submit: ui.send(AddNote, { text: ui.dom.form('note') }) } }, [
          ui.input({ name: 'note', 'aria-label': 'Note', required: true, class: field, value: ctx.note }),
          ui.button({ type: 'submit', class: button }, ['Add note']),
        ]),
        ui.query(
          person,
          { id: search.user },
          {
            ready: (p) =>
              ui.p({ class: 'text-sm' }, [
                'User ',
                p.id,
                ': ',
                p.name,
                ' · ',
                p.email,
                ' · ',
                p.company.name,
              ]),
            pending: ui.p({ class: 'text-sm text-slate-500' }, ['Loading the user…']),
            failed: {
              NotFound: (e) => ui.p({ role: 'alert' }, ['No user ', e.id]),
              Unavailable: (e) => ui.p({ role: 'alert' }, ['The users API answered ', e.status]),
              Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]),
            },
          },
        ),
      ]),

      ui.section({ class: card, 'aria-label': 'On either side' }, [
        ui.h2({ class: 'text-xl font-semibold' }, [
          'On either side ',
          ui.span({ class: badge }, ["runs: 'either'"]),
        ]),
        ui.p({ class: 'text-sm text-slate-600' }, [
          'A public API: in the HTML on the first paint, then called straight from the browser.',
        ]),
        ui.nav({ class: 'flex gap-2', 'aria-label': 'User' }, [
          ...users.map((u) =>
            ui.a(
              {
                href: ui.link(home, null, { user: u }),
                class: 'rounded border px-2 py-0.5 text-sm',
                'aria-current': search.user === u ? 'page' : false,
              },
              [`User ${u}`],
            ),
          ),
        ]),
        ui.query(
          posts,
          { userId: search.user },
          {
            ready: (list) =>
              ui.ol({ class: 'list-decimal pl-5' }, [ui.each(list, 'id', (p) => ui.li({}, [p.title]))]),
            failed: {
              Unavailable: (e) => ui.p({ role: 'alert' }, ['The posts API answered ', e.status]),
              Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]),
            },
          },
        ),
        ui.form(
          { class: 'flex gap-2', on: { submit: ui.send(CreatePost, { title: ui.dom.form('title') }) } },
          [
            ui.input({
              name: 'title',
              'aria-label': 'Post title',
              required: true,
              class: field,
              value: ctx.title,
            }),
            ui.button({ type: 'submit', class: button }, ['Create post']),
          ],
        ),
      ]),

      ui.section({ class: card, 'aria-label': 'In your browser' }, [
        ui.h2({ class: 'text-xl font-semibold' }, [
          'In your browser ',
          ui.span({ class: badge }, ["runs: 'browser'"]),
        ]),
        ui.p({ class: 'text-sm text-slate-600' }, [
          'Drafts in this browser’s localStorage: the server never sees them.',
        ]),
        ui.query(
          drafts,
          {},
          {
            ready: (list) =>
              ui.ul({ class: 'list-disc pl-5' }, [ui.each(list, 'id', (d) => ui.li({}, [d.text]))]),
            pending: ui.p({ class: 'text-sm text-slate-500' }, ['Reading this browser…']),
            failed: { Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]) },
          },
        ),
        ui.form({ class: 'flex gap-2', on: { submit: ui.send(SaveDraft, { text: ui.dom.form('draft') }) } }, [
          ui.input({ name: 'draft', 'aria-label': 'Draft', required: true, class: field, value: ctx.draft }),
          ui.button({ type: 'submit', class: button }, ['Save draft']),
          ui.button(
            {
              type: 'button',
              class: 'rounded border px-3 py-1 text-sm',
              on: { click: ui.send(ClearDrafts, {}) },
            },
            ['Clear'],
          ),
        ]),
      ]),
    ]),
})
