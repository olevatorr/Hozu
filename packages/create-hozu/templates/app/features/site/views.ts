import { ui } from '@hozu/core'

const steps: [string, string, string][] = [
  [
    'Ask your agent',
    'Describe what to build in your own words. It follows the Hozu guide in this folder.',
    '',
  ],
  [
    'Point at the page',
    'The dock at the bottom is Hozu DevTools: choose Select, click a part, and say what should change.',
    '',
  ],
  ['Check the work', 'Types, rules and every decision, before anything runs.', 'npx hozu check'],
  ['Add a page', 'A list, a form and its data, ready to change.', 'npx hozu add feature tasks --page /tasks'],
]

const links: [string, string][] = [
  ['Getting started', 'https://hozu.org/docs/getting-started'],
  ['Hozu UI', 'https://ui.hozu.org'],
  ['GitHub', 'https://github.com/olevatorr/Hozu'],
]

export const Home = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-2xl px-5 py-16' }, [
      ui.img({
        src: ui.asset(new URL('../../assets/icon.png', import.meta.url)),
        width: 64,
        height: 64,
        alt: 'Hozu',
      }),
      ui.h1({ class: 'mt-6 text-4xl font-black tracking-tight text-slate-900' }, [
        'Your Hozu app is running.',
      ]),
      ui.p({ class: 'mt-3 text-lg text-slate-600' }, [
        'This page is ',
        ui.code({ class: 'rounded bg-slate-100 px-1.5 py-0.5 text-base' }, ['features/site/views.ts']),
        '. Change it, delete it, or ask your agent to.',
      ]),
      ui.ol(
        { class: 'mt-10 grid gap-4 sm:grid-cols-2' },
        steps.map(([title, body, command], i) =>
          ui.li({ class: 'rounded-xl border border-slate-200 bg-white p-5' }, [
            ui.p({ class: 'font-mono text-xs font-bold text-orange-600' }, [`0${i + 1}`]),
            ui.h2({ class: 'mt-1 font-bold text-slate-900' }, [title]),
            ui.p({ class: 'mt-1 text-sm text-slate-600' }, [body]),
            command === ''
              ? null
              : ui.code(
                  {
                    class:
                      'mt-3 block overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs whitespace-nowrap text-slate-100',
                  },
                  [command],
                ),
          ]),
        ),
      ),
      ui.nav({ class: 'mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold' }, [
        ...links.map(([label, href]) => ui.a({ href, class: 'text-orange-700 underline' }, [`${label} →`])),
      ]),
    ]),
})
