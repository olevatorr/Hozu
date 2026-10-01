import { ui } from '@hozu/core'
import { about, home } from '../../routes.ts'
import { pick, slideLabel, slides, stats } from './effects.ts'
import {
  AddTodo,
  Draft,
  RemoveTodo,
  SelectMetric,
  SelectTab,
  Shuffle,
  SlideChanged,
  ToggleSpin,
} from './events.ts'
import { siteMachine } from './machine.ts'
import { Carousel, Chart, Globe, Reveal, Sketch, Smooth } from './widgets.ts'

const container = 'mx-auto max-w-6xl px-4 sm:px-6'
const heading = 'text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white'
const card =
  'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900'
const button =
  'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
const tabs = ['design', 'build', 'ship'] as const

const nav = () =>
  ui.header(
    {
      class:
        'site-header sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80',
    },
    [
      ui.nav({ class: `${container} flex h-16 items-center justify-between` }, [
        ui.a({ href: ui.link(home, null), class: 'text-lg font-bold text-slate-900 dark:text-white' }, [
          'Hozu',
        ]),
        ui.div({ class: 'flex gap-6 text-sm text-slate-600 dark:text-slate-300' }, [
          ui.a({ href: '#features', class: 'hover:text-indigo-600' }, ['Features']),
          ui.a({ href: '#gallery', class: 'hover:text-indigo-600' }, ['Gallery']),
          ui.a({ href: ui.link(about, null), class: 'hover:text-indigo-600' }, ['About']),
        ]),
      ]),
    ],
  )

export const Showcase = ui.view({
  machine: siteMachine,
  render: ({ ctx }) =>
    ui.use(
      Smooth,
      {
        props: {},
        on: {},
        class: 'min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100',
      },
      [
        nav(),
        ui.main({}, [
          ui.section({ class: `${container} grid items-center gap-12 py-20 md:grid-cols-2` }, [
            ui.div({ class: 'space-y-6' }, [
              ui.p({ class: 'text-sm font-semibold uppercase tracking-widest text-indigo-600' }, [
                'AI-first, human-facing',
              ]),
              ui.h1(
                {
                  class:
                    'bg-gradient-to-br from-slate-900 to-indigo-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl dark:from-white dark:to-indigo-400',
                },
                ['Verified by machines. Built for people.'],
              ),
              ui.p({ class: 'max-w-prose text-lg text-slate-600 dark:text-slate-300' }, [
                'Every animation, widget and style you expect from a modern site, with a program an AI can check.',
              ]),
              ui.div({ class: 'flex flex-wrap gap-3' }, [
                ui.a(
                  {
                    href: '#features',
                    class: `${button} bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500`,
                  },
                  ['Explore'],
                ),
                ui.button(
                  {
                    type: 'button',
                    class: `${button} border border-slate-300 text-slate-700 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200`,
                    'aria-pressed': ctx.spin,
                    on: { click: ui.send(ToggleSpin, {}) },
                  },
                  [ctx.spin === true ? 'Pause globe' : 'Spin globe'],
                ),
              ]),
            ]),
            ui.use(
              Globe,
              { props: { spin: ctx.spin }, on: {}, class: 'aspect-square w-full text-indigo-500' },
              [
                ui.div(
                  { class: 'h-full w-full rounded-full bg-gradient-to-br from-indigo-500/30 to-sky-400/10' },
                  [],
                ),
              ],
            ),
          ]),
          ui.use(Reveal, { props: {}, on: {}, class: 'py-16' }, [
            ui.section({ id: 'features', class: `${container} space-y-10` }, [
              ui.h2({ class: heading }, ['What you get']),
              ui.div({ class: 'grid gap-6 md:grid-cols-3' }, [
                ui.article({ class: card, 'data-reveal': true }, [
                  ui.h3({ class: 'text-lg font-semibold' }, ['Closed views']),
                  ui.p({ class: 'mt-2 text-slate-600 dark:text-slate-300' }, [
                    'Every node is data the validator can read.',
                  ]),
                ]),
                ui.article({ class: card, 'data-reveal': true }, [
                  ui.h3({ class: 'text-lg font-semibold' }, ['Derived rendering']),
                  ui.p({ class: 'mt-2 text-slate-600 dark:text-slate-300' }, [
                    'Static, ISR or streamed: decided, not configured.',
                  ]),
                ]),
                ui.article({ class: card, 'data-reveal': true }, [
                  ui.h3({ class: 'text-lg font-semibold' }, ['Any library']),
                  ui.p({ class: 'mt-2 text-slate-600 dark:text-slate-300' }, [
                    'three.js, GSAP, Swiper and more, behind typed widgets.',
                  ]),
                ]),
              ]),
            ]),
          ]),
          ui.section({ class: `${container} space-y-6 py-16` }, [
            ui.h2({ class: heading }, ['How it works']),
            ui.div(
              { role: 'tablist', class: 'inline-flex rounded-full bg-slate-200/70 p-1 dark:bg-slate-800' },
              [
                ...tabs.map((tab) =>
                  ui.button(
                    {
                      type: 'button',
                      role: 'tab',
                      class:
                        'rounded-full px-4 py-1.5 text-sm font-medium capitalize text-slate-600 transition dark:text-slate-300 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow dark:aria-selected:bg-slate-950 dark:aria-selected:text-white',
                      'aria-selected': ctx.tab === tab,
                      on: { click: ui.send(SelectTab, { tab }) },
                    },
                    [tab],
                  ),
                ),
              ],
            ),
            ui.div({ role: 'tabpanel', class: 'relative min-h-24' }, [
              ui.if(
                ctx.tab === 'design',
                [
                  ui.p({ class: 'panel' }, [
                    'Describe features as data: events, queries, machines and views.',
                  ]),
                ],
                [
                  ui.if(
                    ctx.tab === 'build',
                    [
                      ui.p({ class: 'panel' }, [
                        'The validator checks every reference, state and class before you run it.',
                      ]),
                    ],
                    [
                      ui.p({ class: 'panel' }, [
                        'Ship HTML first; only interactive islands download JavaScript.',
                      ]),
                    ],
                    'fade',
                  ),
                ],
                'fade',
              ),
            ]),
          ]),
          ui.section({ id: 'gallery', class: 'space-y-6 py-16' }, [
            ui.div({ class: `${container} flex items-end justify-between` }, [
              ui.h2({ class: heading }, ['Gallery']),
              ui.query(
                slides,
                {},
                {
                  ready: (list) =>
                    ui.p({ class: 'text-sm tabular-nums text-slate-500' }, [
                      slideLabel({ index: ctx.slide, total: list.length }),
                    ]),
                  pending: null,
                  failed: { Unexpected: () => ui.p({}, ['']) },
                },
              ),
            ]),
            ui.query(
              slides,
              {},
              {
                ready: (list) =>
                  ui.use(
                    Carousel,
                    {
                      props: { perView: 3 },
                      on: { changed: (d) => ui.send(SlideChanged, { index: d.index }) },
                      class: `swiper ${container}`,
                    },
                    [
                      ui.div({ class: 'swiper-wrapper' }, [
                        ui.each(list, 'id', (slide) =>
                          ui.article({ class: `swiper-slide ${card} h-48`, vars: { '--hue': slide.hue } }, [
                            ui.div({ class: 'mb-4 h-2 w-12 rounded-full bg-[hsl(var(--hue)_80%_60%)]' }, []),
                            ui.h3({ class: 'text-lg font-semibold' }, [slide.title]),
                            ui.p({ class: 'mt-2 text-slate-600 dark:text-slate-300' }, [slide.body]),
                          ]),
                        ),
                      ]),
                    ],
                  ),
                pending: null,
                failed: { Unexpected: () => ui.p({}, ['Gallery unavailable']) },
              },
            ),
          ]),
          ui.section({ class: `${container} grid gap-10 py-16 md:grid-cols-2` }, [
            ui.div({ class: 'space-y-4' }, [
              ui.h2({ class: heading }, ['Tasks']),
              ui.form(
                { class: 'flex gap-2', on: { submit: ui.send(AddTodo, { title: ui.dom.form('title') }) } },
                [
                  ui.label({ for: 'title', class: 'sr-only' }, ['New task']),
                  ui.input({
                    id: 'title',
                    name: 'title',
                    required: true,
                    minlength: 2,
                    placeholder: 'Add a task',
                    value: ctx.draft,
                    class:
                      'min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 invalid:[&:not(:placeholder-shown)]:border-rose-400 dark:border-slate-700 dark:bg-slate-900',
                    on: { input: ui.send(Draft, { text: ui.dom.value }) },
                  }),
                  ui.button(
                    {
                      type: 'submit',
                      class: `${button} bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900`,
                    },
                    ['Add'],
                  ),
                ],
              ),
              ctx.todos.length === 0
                ? ui.p({ class: 'text-slate-500' }, ['Nothing left. Nice.'])
                : ui.ul({ class: 'relative space-y-2' }, [
                    ui.each(
                      ctx.todos,
                      'id',
                      (todo) =>
                        ui.li(
                          {
                            class:
                              'flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900',
                          },
                          [
                            ui.span({}, [todo.title]),
                            ui.button(
                              {
                                type: 'button',
                                'aria-label': 'Remove',
                                class:
                                  'rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600',
                                on: { click: ui.send(RemoveTodo, { id: todo.id }) },
                              },
                              ['×'],
                            ),
                          ],
                        ),
                      'list',
                    ),
                  ]),
              ui.button(
                {
                  type: 'button',
                  class: 'text-sm text-indigo-600 hover:underline',
                  on: { click: ui.send(Shuffle, {}) },
                },
                ['Reverse order'],
              ),
            ]),
            ui.div({ class: 'space-y-4' }, [
              ui.div({ class: 'flex items-center justify-between' }, [
                ui.h2({ class: heading }, ['Traffic']),
                ui.select(
                  {
                    class:
                      'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900',
                    'aria-label': 'Metric',
                    on: { change: ui.send(SelectMetric, { metric: ui.dom.value }) },
                  },
                  [
                    ui.option({ value: 'visits', selected: ctx.metric === 'visits' }, ['Visits']),
                    ui.option({ value: 'signups', selected: ctx.metric === 'signups' }, ['Sign-ups']),
                  ],
                ),
              ]),
              ui.query(
                stats,
                {},
                {
                  ready: (data) =>
                    ui.use(
                      Chart,
                      {
                        props: pick({ stats: data, metric: ctx.metric }),
                        on: {},
                        class:
                          'h-64 rounded-2xl border border-slate-200 bg-white p-4 text-indigo-500 dark:border-slate-800 dark:bg-slate-900',
                      },
                      [
                        ui.table({ class: 'w-full text-sm' }, [
                          ui.tbody({}, [
                            ui.each(data.visits.labels, null, (label) =>
                              ui.tr({}, [ui.th({ class: 'text-left font-normal' }, [label])]),
                            ),
                          ]),
                        ]),
                      ],
                    ),
                  pending: null,
                  failed: { Unexpected: () => ui.p({}, ['No data']) },
                },
              ),
            ]),
          ]),
          ui.section({ class: `${container} py-16` }, [
            ui.use(
              Sketch,
              { props: { hue: 230 }, on: {}, class: 'h-64 overflow-hidden rounded-3xl bg-slate-900' },
              [ui.p({ class: 'p-6 text-slate-400' }, ['Generative sketch'])],
            ),
          ]),
        ]),
        ui.footer(
          {
            class: `${container} border-t border-slate-200 py-10 text-sm text-slate-500 dark:border-slate-800`,
          },
          ['© 2026 Hozu'],
        ),
      ],
    ),
})

export const About = ui.view({
  render: () =>
    ui.div(
      { class: 'min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100' },
      [
        nav(),
        ui.main({ class: `${container} prose prose-slate py-20 dark:prose-invert` }, [
          ui.h1({}, ['About this showcase']),
          ui.p({}, [
            'The same page is built with Hozu and with Nuxt, then compared screenshot by screenshot. See docs/benchmarks/0002-parity.md.',
          ]),
        ]),
      ],
    ),
})
