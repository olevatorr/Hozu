import { feature, ui } from '@hozu/core'
import { chapter, doc, how, trials } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { listChapters } from '../content/model.ts'
import { content } from '../content/views.ts'
import { contracts, m, Run, SetContract } from './model.ts'

const code = (text: string) =>
  ui.pre({ tabindex: 0, class: 'overflow-x-auto bg-ink p-4 font-mono text-xs text-paper' }, [
    ui.code({}, [text]),
  ])
const kicker = 'font-mono text-xs font-bold uppercase text-ember'
const pane = 'border-b-2 border-ink pb-2 flex justify-between font-mono text-xs font-bold'
const pressed =
  'border-4 border-ink px-3 py-1 font-mono text-xs font-bold aria-pressed:bg-ink aria-pressed:text-paper'
export const How = ui.view({
  machine: m,
  route: how,
  render: ({ ctx, when }) =>
    ui.main({ id: 'main', class: 'bg-paper' }, [
      ui.section(
        {
          class:
            'mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center',
        },
        [
          ui.div({}, [
            ui.p({ class: kicker }, ['Understand the design. Try the decisions.']),
            ui.h1(
              { class: 'mt-4 whitespace-pre-line text-5xl font-black uppercase leading-[0.9] md:text-7xl' },
              ['An idea goes in.\nA checked app comes out.'],
            ),
            ui.p({ class: 'mt-5 max-w-xl text-lg' }, [
              'Follow a feature through Hozu. Break a contract. Change the data rules. See what the framework can make explicit.',
            ]),
            ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
              ui.use(Button, { props: { href: '#pipeline-lab' } }, ['Try the pipeline']),
              ui.use(Button, { variant: { intent: 'outline' }, props: { href: '#design-chapters' } }, [
                'Read the design',
              ]),
            ]),
          ]),
          ui.div({ class: 'hidden md:block', 'aria-hidden': 'true' }, [
            ui.img({
              src: ui.asset(new URL('../../assets/logo.png', import.meta.url)),
              width: 256,
              height: 256,
              alt: '',
            }),
            ui.p({ class: 'mt-3 flex justify-between font-mono text-xs font-bold' }, [
              ui.span({}, ['Intent']),
              ui.span({}, ['Structure']),
            ]),
          ]),
        ],
      ),
      ui.section(
        {
          id: 'pipeline-lab',
          class: 'border-y-4 border-ink bg-white px-5 py-14',
          'aria-labelledby': 'pipeline-heading',
        },
        [
          ui.div({ class: 'mx-auto grid max-w-6xl gap-4 md:grid-cols-2 md:items-end' }, [
            ui.div({}, [
              ui.p({ class: kicker }, ['Explore the pipeline']),
              ui.h2({ id: 'pipeline-heading', class: 'text-3xl font-black uppercase md:text-5xl' }, [
                'Make it. Check it. Then ship it.',
              ]),
            ]),
            ui.p({}, [
              'A preset walkthrough, powered by a real Hozu machine. It illustrates the design; it does not compile source in your browser.',
            ]),
          ]),
          ui.div({ class: 'mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2' }, [
            ui.div({ class: 'grid content-start gap-4' }, [
              ui.div({ class: pane }, [ui.span({}, ['feature.ts']), ui.span({}, ['A guarded toggle'])]),
              code(
                "const Toggle = event({ payload: z.object({}) })\n\nconst m = machine({\n  context: z.object({ allowed: z.boolean() }),\n  initialContext: { allowed: true },\n  initial: 'off',\n  states: ({ ctx }) => ({\n    off: { on: [on(Toggle, { target: 'on', guard: () => ctx.allowed === true })] },\n    on: { on: [on(Toggle, { target: 'off' })] },\n  }),\n})",
              ),
              ui.div({ class: 'grid gap-3' }, [
                ui.div({ class: pane }, [
                  ui.span({}, ['contracts.ts']),
                  ui.span({}, ['The off → on decision']),
                ]),
                ctx.missing === false
                  ? code(
                      "contract(m, {\n  given: { state: 'off' },\n  when: [{ send: Toggle, payload: {} }],\n  expect: { state: 'on' },\n})",
                    )
                  : ui.div({ class: 'border-4 border-red p-4' }, [
                      ui.strong({}, ['Contract removed']),
                      ui.p({}, ['The guard still decides. What it should decide is no longer written down.']),
                    ]),
                ui.p({ class: 'text-xs' }, [
                  'Excerpts: imports and feature registration are omitted. on → off decides nothing, so the lock records it and it needs no contract.',
                ]),
              ]),
            ]),
            ui.div({ class: 'grid content-start gap-4' }, [
              ui.ol({ class: 'grid gap-2', 'aria-label': 'Pipeline stages' }, [
                ...[
                  ['Source', 'Typed declarations', ['idle', 'source', 'brokenSource']],
                  ['Feature IR', 'One shared representation', ['ir', 'brokenIr']],
                  ['Validator', 'Rules and contracts', ['validated', 'blocked']],
                  ['Compiler', 'Derived rendering', ['compiled']],
                  ['Runtime', 'HTML and islands', ['done']],
                ].map(([title, description, states], index) =>
                  ui.li(
                    {
                      class: 'relative flex items-center gap-3 overflow-hidden border-4 border-ink px-3 py-2',
                    },
                    [
                      ui.span({ class: 'font-mono text-xs font-bold text-ember' }, [String(index + 1)]),
                      ui.div({ class: 'grid flex-1' }, [
                        ui.strong({ class: 'uppercase' }, [title as string]),
                        ui.small({}, [description as string]),
                      ]),
                      when(
                        states as (
                          | 'idle'
                          | 'source'
                          | 'brokenSource'
                          | 'ir'
                          | 'brokenIr'
                          | 'validated'
                          | 'blocked'
                          | 'compiled'
                          | 'done'
                        )[],
                        [
                          ui.span({ class: 'absolute inset-0 -z-0 bg-red/15', 'aria-hidden': 'true' }, []),
                          ui.span({ class: 'relative text-ember', 'aria-label': 'Current stage' }, ['●']),
                        ],
                        'fade',
                      ),
                    ],
                  ),
                ),
              ]),
              ui.div(
                {
                  class: 'grid h-44 overflow-hidden border-4 border-ink p-4 [&>*]:[grid-area:1/1]',
                  'aria-live': 'polite',
                  'aria-atomic': 'true',
                },
                [
                  when(
                    ['idle'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, ['Your feature is ready.']),
                        ui.p({}, [
                          'Run the valid example first. Then remove its contract and find out where Hozu stops.',
                        ]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['source', 'brokenSource'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, ['Reading the declarations…']),
                        ui.p({}, ['Events, states and transitions describe the program before it executes.']),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['ir', 'brokenIr'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, ['Recording the feature IR…']),
                        code('off ── Toggle ──▶ on\non  ── Toggle ──▶ off'),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['validated'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, ['The behaviour is covered.']),
                        ui.p({}, [
                          'Every transition that decides has a contract. The pipeline can continue.',
                        ]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['compiled'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, ['Deriving the render plan…']),
                        ui.p({}, [
                          'The machine-bound toggle becomes an interactive island. The surrounding content remains HTML.',
                        ]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['done'],
                    [
                      ui.div({}, [
                        ui.div({ class: 'border-l-8 border-green pl-3' }, [
                          ui.p({ class: 'font-black uppercase' }, ['Ready to render.']),
                          ui.p({}, [
                            'The declarations, contracts and rendering plan agree. Now try removing the contract and run it again.',
                          ]),
                        ]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['blocked'],
                    [
                      ui.div({}, [
                        ui.div({ class: 'border-l-8 border-red pl-3' }, [
                          ui.p({ class: 'font-black uppercase' }, ['Stopped at validation.']),
                          ui.code({}, ['HZ016 · uncovered transition']),
                          ui.p({}, [
                            'The off → on transition has a guard, so it decides and needs a contract. Restore its expected behaviour before continuing.',
                          ]),
                        ]),
                      ]),
                    ],
                    'fade',
                  ),
                ],
              ),
              ui.div({ class: 'flex flex-wrap items-center gap-3' }, [
                ui.button(
                  {
                    type: 'button',
                    class: 'bg-red px-4 py-2 font-black uppercase text-ink',
                    on: { click: ui.send(Run, {}) },
                  },
                  ['Run example'],
                ),
                ui.button(
                  {
                    type: 'button',
                    class: 'border-4 border-ink px-4 py-1.5 font-black uppercase',
                    on: { click: ui.send(SetContract, { missing: ctx.missing === false }) },
                  },
                  [ctx.missing === false ? 'Remove contract' : 'Restore contract'],
                ),
                ui.div({ class: 'h-5 min-w-0 flex-1' }, [
                  when(
                    ['source', 'ir', 'validated', 'compiled', 'brokenSource', 'brokenIr'],
                    [
                      ui.p({ class: 'font-mono text-xs', role: 'status' }, [
                        'Running… Controls unlock when this walkthrough finishes.',
                      ]),
                    ],
                    'fade',
                  ),
                ]),
              ]),
            ]),
          ]),
          ui.noscript({}, [
            ui.p({ class: 'mx-auto mt-6 max-w-6xl font-mono text-xs' }, [
              'This walkthrough needs JavaScript. The six design chapters below explain the same pipeline without it.',
            ]),
          ]),
        ],
      ),
      ui.section(
        {
          class: 'mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-[22rem_minmax(0,1fr)]',
          'aria-labelledby': 'render-heading',
        },
        [
          ui.div({ class: 'grid content-start gap-3' }, [
            ui.p({ class: kicker }, ['Explore the render plan']),
            ui.h2({ id: 'render-heading', class: 'whitespace-pre-line text-3xl font-black uppercase' }, [
              'You describe the data.\nHozu places the boundaries.',
            ]),
            ui.p({}, [
              'Change these declarations and watch the diagram respond. Caching and interactivity are separate decisions.',
            ]),
            ui.a(
              {
                href: ui.link(chapter, { slug: 'derived-rendering' }),
                class: 'font-bold underline decoration-red',
              },
              ['Read about derived rendering'],
            ),
          ]),
          ui.div({ class: 'grid gap-6' }, [
            ui.div({ class: 'grid gap-4' }, [
              ui.fieldset({ class: 'flex flex-wrap gap-2' }, [
                ui.legend({ class: 'mb-2 font-mono text-xs font-bold uppercase' }, ['Data scope']),
                ...(['public', 'user'] as const).map((value) =>
                  ui.button(
                    {
                      type: 'button',
                      class: pressed,
                      'aria-pressed': ctx.scope === value,
                      on: { click: ui.set(ctx.scope, value) },
                    },
                    [value],
                  ),
                ),
              ]),
              ui.fieldset({ class: 'flex flex-wrap gap-2' }, [
                ui.legend({ class: 'mb-2 font-mono text-xs font-bold uppercase' }, ['Freshness']),
                ...(['static', 'revalidate', 'swr', 'live'] as const).map((value) =>
                  ui.button(
                    {
                      type: 'button',
                      class: pressed,
                      'aria-pressed': ctx.freshness === value,
                      on: { click: ui.set(ctx.freshness, value) },
                    },
                    [value],
                  ),
                ),
              ]),
              ui.fieldset({ class: 'flex flex-wrap gap-2' }, [
                ui.legend({ class: 'mb-2 font-mono text-xs font-bold uppercase' }, ['Machine binding']),
                ...([false, true] as const).map((value) =>
                  ui.button(
                    {
                      type: 'button',
                      class: pressed,
                      'aria-pressed': ctx.binding === value,
                      on: { click: ui.set(ctx.binding, value) },
                    },
                    [value ? 'Bound' : 'None'],
                  ),
                ),
              ]),
            ]),
            ui.div({ class: 'border-4 border-ink bg-white', 'aria-live': 'polite', 'aria-atomic': 'true' }, [
              ui.div({ class: 'flex justify-between bg-ink px-3 py-2 font-mono text-xs text-paper' }, [
                ui.span({}, ['Your page']),
                ui.span({}, ['Render-plan illustration']),
              ]),
              ui.div({ class: 'grid gap-3 p-4' }, [
                ui.div({ class: 'flex justify-between border-2 border-dashed border-ink p-3' }, [
                  ui.span({}, ['Static shell']),
                  ui.small({}, ['Navigation, headings, article']),
                ]),
                ui.div(
                  {
                    class: 'border-4 p-3',
                    toggle: { 'border-red': ctx.scope === 'user', 'border-ink': ctx.scope !== 'user' },
                  },
                  [
                    ui.small({}, ['Query region']),
                    ctx.scope === 'user'
                      ? [
                          ui.h3({}, ['Private · request-time']),
                          ui.p({}, ['Never in a shared cache. User scope takes priority over freshness.']),
                        ]
                      : [
                          ctx.freshness === 'static' && [
                            ui.h3({}, ['Static HTML']),
                            ui.p({}, ['Public, static data can be rendered ahead of time.']),
                          ],
                          ctx.freshness === 'revalidate' && [
                            ui.h3({}, ['ISR']),
                            ui.p({}, [
                              'A server regenerates the cached region on its revalidation schedule.',
                            ]),
                          ],
                          ctx.freshness === 'swr' && [
                            ui.h3({}, ['Stale while revalidate']),
                            ui.p({}, ['Serve cached public data while the server refreshes it.']),
                          ],
                          ctx.freshness === 'live' && [
                            ui.h3({}, ['Request-time data']),
                            ui.p({}, ['Live freshness needs a server and the framework’s live transport.']),
                          ],
                        ],
                  ],
                ),
                ui.div(
                  {
                    class: 'border-4 p-3',
                    toggle: { 'border-green': ctx.binding === true, 'border-ink': ctx.binding !== true },
                  },
                  [
                    ctx.binding === true
                      ? [
                          ui.strong({}, ['Interactive island']),
                          ui.p({}, ['This machine-bound node needs client JavaScript.']),
                        ]
                      : [
                          ui.strong({}, ['Plain HTML']),
                          ui.p({}, ['No machine binding. This node does not hydrate.']),
                        ],
                  ],
                ),
              ]),
              ui.div(
                {
                  class:
                    'flex flex-wrap justify-between gap-2 border-t-4 border-ink px-4 py-2 font-mono text-xs font-bold',
                },
                [
                  ctx.scope === 'public' && ctx.freshness === 'static'
                    ? ui.span({}, ['Data: static export possible'])
                    : ui.span({}, ['Data: server required']),
                  ctx.binding === true
                    ? ui.span({}, ['Interaction: client JS'])
                    : ui.span({}, ['Interaction: no hydration']),
                ],
              ),
            ]),
            ui.p({ class: 'font-mono text-xs' }, [
              'This models one query in a static shell. Dependencies can make a region more dynamic. The controls update a local illustration; they do not fetch private or live data.',
            ]),
          ]),
        ],
      ),
      ui.section({ id: 'design-chapters', class: 'border-t-4 border-ink bg-ink px-5 py-14 text-paper' }, [
        ui.div({}, [
          ui.p({ class: 'font-mono text-xs font-bold uppercase text-red' }, ['Go a little deeper']),
          ui.h2({ class: 'text-3xl font-black uppercase md:text-5xl' }, ['The reasoning behind the rules.']),
          ui.p({}, ['Six chapters, from the first design decision to the costs that remain.']),
        ]),
        ui.query(
          listChapters,
          {},
          {
            ready: (items) =>
              ui.ol({ class: 'mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3' }, [
                ui.each(items, 'slug', (item) =>
                  ui.li({}, [
                    ui.a(
                      {
                        href: ui.link(chapter, { slug: item.slug }),
                        class: 'flex h-full gap-3 border-4 border-paper p-4',
                      },
                      [
                        ui.span({ class: 'font-mono text-xs font-bold text-red' }, [item.order]),
                        ui.div({ class: 'flex-1' }, [
                          ui.h3({ class: 'font-black uppercase' }, [item.title]),
                          ui.p({ class: 'mt-2 text-sm' }, [item.description]),
                        ]),
                        ui.span({ 'aria-hidden': 'true' }, ['↗']),
                      ],
                    ),
                  ]),
                ),
              ]),
            pending: null,
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Chapters are unavailable.']) },
          },
        ),
        ui.div({ class: 'mt-8 flex flex-wrap items-center gap-6' }, [
          ui.a(
            {
              href: ui.link(doc, { slug: 'getting-started' }),
              class: 'bg-red px-4 py-3 font-black uppercase text-ink',
            },
            ['Build your first feature'],
          ),
          ui.a({ href: ui.link(trials, null), class: 'font-bold underline' }, [
            'Examine the measured results',
          ]),
        ]),
      ]),
    ]),
})
export const lab = feature({
  id: 'lab',
  intent: { summary: 'Interactive, explicitly illustrative walkthrough of Hozu validation and rendering' },
  imports: [content],
  declarations: [{ Run, SetContract, m, How, ...contracts }],
})
