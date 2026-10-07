import { ui } from '@hozu/core'
import { Add, CopyQuote, listMachine, myList, Pause, quotes, RefreshNow, Remove, Resume } from './model.ts'

const button = 'rounded border border-slate-300 px-2 py-1 text-sm'

export const Board = ui.view({
  machine: listMachine,
  render: ({ ctx, when, is }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-10' }, [
      ui.div({ class: 'flex items-center justify-between' }, [
        ui.h1({ class: 'text-3xl font-bold' }, ['Watchlist']),
        ui.div({ class: 'flex gap-2' }, [
          is(['paused'])
            ? ui.button({ type: 'button', class: button, on: { click: ui.send(Resume, {}) } }, ['Resume'])
            : ui.button({ type: 'button', class: button, on: { click: ui.send(Pause, {}) } }, ['Pause']),
          ui.button({ type: 'button', class: button, on: { click: ui.send(RefreshNow, {}) } }, [
            'Refresh now',
          ]),
        ]),
      ]),
      ui.p({ class: 'text-slate-600' }, ['Your symbols stay in this browser; quotes come from the server.']),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { symbol: ui.dom.form('symbol') }) } }, [
        ui.input({
          name: 'symbol',
          'aria-label': 'Symbol',
          placeholder: 'AAPL',
          required: true,
          class: 'flex-1 rounded border px-2 uppercase',
        }),
        ui.button({ type: 'submit', class: button, disabled: is(['adding']) }, ['Add']),
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-red-700' }, [ctx.error]),
      ui.query(
        myList,
        {},
        {
          ready: (symbols) =>
            ui.query(
              quotes,
              { symbols },
              {
                ready: (rows) =>
                  ui.ul({ class: 'divide-y rounded border' }, [
                    ui.each(rows, 'symbol', (q) =>
                      ui.li({ class: 'flex items-center gap-3 px-3 py-2' }, [
                        ui.span({ class: 'w-16 font-semibold' }, [q.symbol]),
                        ui.span({ class: 'flex-1 tabular-nums' }, [
                          ui.format.number(q.price, { style: 'currency', currency: 'USD' }),
                        ]),
                        ui.span({ class: 'tabular-nums text-slate-600' }, [
                          ui.format.number(q.change, { signDisplay: 'always', maximumFractionDigits: 2 }),
                        ]),
                        ui.button(
                          {
                            type: 'button',
                            class: button,
                            on: { click: ui.send(CopyQuote, { text: q.symbol }) },
                          },
                          ['Copy'],
                        ),
                        ui.button(
                          {
                            type: 'button',
                            class: button,
                            on: { click: ui.send(Remove, { symbol: q.symbol }) },
                          },
                          ['Remove'],
                        ),
                      ]),
                    ),
                  ]),
                failed: { Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]) },
              },
            ),
          pending: ui.p({ class: 'text-slate-500' }, ['Loading your list…']),
          failed: { Unexpected: (e) => ui.p({ role: 'alert' }, [e.message]) },
        },
      ),
    ]),
})
