import { ui } from '@hozu/core'
import { doc, home, trials } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { Display } from '../../site/display.ts'
import { Joint3D } from '../../site/joint.ts'
import { Ticker } from '../../site/ticker.ts'
import { claim } from '../content/claims.ts'
import { Break, Fix, m } from './model.ts'

export const Hero = ui.view({
  machine: m,
  route: home,
  render: ({ ctx, when }) =>
    ui.div({ id: 'main', class: 'relative overflow-hidden bg-paper' }, [
      ui.div({ class: 'mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center' }, [
        ui.div({}, [
          ui.use(Display, {
            props: {
              words: [
                { id: '1', text: 'Your', accent: false },
                { id: '2', text: 'AI', accent: false },
                { id: '3', text: 'writes', accent: false },
                { id: '4', text: 'the app.', accent: false },
                { id: '5', text: 'Hozu', accent: true },
                { id: '6', text: 'checks', accent: true },
                { id: '7', text: 'it.', accent: true },
              ],
            },
          }),
          ui.p({ class: 'mt-5 max-w-md text-lg' }, [
            'It costs more tokens than other frameworks. That is the price of a second pair of eyes on every change.',
          ]),
          ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'getting-started' }) } }, [
              'Start building →',
            ]),
            ui.use(Button, { variant: { intent: 'outline' }, props: { href: ui.link(trials, null) } }, [
              'See the proof',
            ]),
          ]),
          ui.div(
            { class: 'mt-8 max-w-md border-4 border-ink bg-white shadow-[8px_8px_0_var(--color-ink)]' },
            [
              ui.div(
                { class: 'flex items-center justify-between bg-ink px-3 py-2 text-sm font-bold text-paper' },
                [
                  ui.span({}, ['notes · signed in as ada']),
                  when(
                    ['broken'],
                    [
                      ui.button(
                        {
                          type: 'button',
                          class: 'bg-green px-3 py-1 font-black',
                          on: { click: ui.send(Fix, {}) },
                        },
                        ['APPLY FIX'],
                      ),
                    ],
                  ),
                  when(
                    ['clean'],
                    [
                      ui.button(
                        {
                          type: 'button',
                          class: 'bg-red px-3 py-1 font-black',
                          on: { click: ui.send(Break, {}) },
                        },
                        ['AI CHANGE'],
                      ),
                    ],
                  ),
                ],
              ),
              ui.p({ class: 'px-3 py-2' }, ['Buy milk']),
              ctx.broken && ui.p({ class: 'bg-red/10 px-3 py-2' }, ["Bob's secret · bob ⚠"]),
              ui.p(
                {
                  class: 'border-t-4 border-ink px-3 py-2 font-mono text-xs',
                  toggle: { 'bg-red text-white': ctx.broken },
                  'aria-live': 'polite',
                },
                [
                  ctx.broken
                    ? '✘ HZ049 your notes would be cached and shown to bob'
                    : '✔ types ok · 0 errors · lock current',
                ],
              ),
            ],
          ),
        ]),
        ui.use(Joint3D, { props: { split: ctx.broken } }),
      ]),
      ui.use(Ticker, {
        props: {
          items: [
            `${claim('regressions').value} regressions in 16 changes`,
            `${claim('tokens').value} the tokens of Nuxt`,
            'every change checked',
          ],
        },
      }),
    ]),
})
