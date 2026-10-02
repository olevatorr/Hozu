import { ui } from '@hozu/core'
import { home } from '../../routes.ts'
import { SaveToken, Search, Star, searchRepos, starred, starsMachine, Unstar } from './model.ts'

const button = 'rounded border border-slate-300 px-2 py-1 text-sm'

export const Board = ui.view({
  machine: starsMachine,
  route: home,
  seed: ({ search }) => ({ q: search.q }),
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-2xl space-y-8 px-4 py-10' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Stars']),
      ui.p({ class: 'text-slate-600' }, [
        'Everything here runs in your browser: your token stays in this browser and goes only to GitHub.',
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-red-700' }, [ctx.error]),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(SaveToken, { token: ui.dom.form('token') }) } }, [
        ui.input({
          name: 'token',
          type: 'password',
          'aria-label': 'GitHub token',
          class: 'flex-1 rounded border px-2',
        }),
        ui.button({ type: 'submit', class: button }, ['Save token']),
      ]),
      when(['saving', 'starring', 'unstarring'], [ui.p({ 'aria-busy': 'true' }, ['Talking to GitHub…'])]),
      ui.section({ 'aria-label': 'Your stars', class: 'space-y-2' }, [
        ui.h2({ class: 'text-xl font-semibold' }, ['Your stars']),
        ui.query(
          starred,
          {},
          {
            ready: (repos) =>
              ui.ul({ class: 'divide-y' }, [
                ui.each(repos, 'id', (r) =>
                  ui.li({ class: 'flex items-center justify-between gap-2 py-2' }, [
                    ui.span({}, [r.full_name]),
                    ui.button(
                      {
                        type: 'button',
                        class: button,
                        on: { click: ui.send(Unstar, { repo: r.full_name }) },
                      },
                      ['Unstar'],
                    ),
                  ]),
                ),
              ]),
            pending: ui.p({ class: 'text-slate-500' }, ['Loading your stars…']),
            failed: {
              Unauthorized: () =>
                ui.p({ class: 'text-slate-500' }, ['Paste a GitHub token to see your stars.']),
              Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]),
            },
          },
        ),
      ]),
      ui.section({ 'aria-label': 'Search', class: 'space-y-2' }, [
        ui.h2({ class: 'text-xl font-semibold' }, ['Search']),
        ui.form({ method: 'get' }, [
          ui.input({
            type: 'search',
            name: 'q',
            'aria-label': 'Search repositories',
            value: ctx.q,
            class: 'w-full rounded border px-2 py-1',
            on: { input: ui.send(Search, { q: ui.dom.value }) },
          }),
        ]),
        ui.query(
          searchRepos,
          { q: ctx.q },
          {
            ready: (repos) =>
              ui.ul({ class: 'divide-y' }, [
                ui.each(repos, 'id', (r) =>
                  ui.li({ class: 'flex items-center justify-between gap-2 py-2' }, [
                    ui.span({}, [r.full_name, ' · ', r.stargazers_count, ' ★']),
                    ui.button(
                      { type: 'button', class: button, on: { click: ui.send(Star, { repo: r.full_name }) } },
                      ['Star'],
                    ),
                  ]),
                ),
              ]),
            failed: {
              Unavailable: (e) => ui.p({ role: 'alert' }, [`GitHub answered ${e.status}`]),
              Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]),
            },
          },
        ),
      ]),
    ]),
})
