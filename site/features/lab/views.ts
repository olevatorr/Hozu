import { feature, ui } from '@hozu/core'
import { chapter, doc, how, trials } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { listChapters } from '../content/model.ts'
import { content } from '../content/views.ts'
import * as messages from './messages.ts'
import { labText as t } from './messages.ts'
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
  render: ({ ctx, when, locale }) =>
    ui.main({ id: 'main', class: 'bg-paper' }, [
      ui.section(
        {
          class:
            'mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center',
        },
        [
          ui.div({}, [
            ui.p({ class: kicker }, [t.kicker]),
            ui.h1(
              { class: 'mt-4 whitespace-pre-line text-5xl font-black uppercase leading-[0.9] md:text-7xl' },
              [t.title],
            ),
            ui.p({ class: 'mt-5 max-w-xl text-lg' }, [t.lead]),
            ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
              ui.use(Button, { props: { href: '#pipeline-lab' } }, [t.tryPipeline]),
              ui.use(Button, { variant: { intent: 'outline' }, props: { href: '#design-chapters' } }, [
                t.readDesign,
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
              ui.span({}, [t.intent]),
              ui.span({}, [t.structure]),
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
              ui.p({ class: kicker }, [t.explorePipeline]),
              ui.h2({ id: 'pipeline-heading', class: 'text-3xl font-black uppercase md:text-5xl' }, [
                t.pipelineHeading,
              ]),
            ]),
            ui.p({}, [t.pipelineLead]),
          ]),
          ui.div({ class: 'mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2' }, [
            ui.div({ class: 'grid content-start gap-4' }, [
              ui.div({ class: pane }, [ui.span({}, ['feature.ts']), ui.span({}, [t.guardedToggle])]),
              code(
                "const Toggle = event({ payload: z.object({}) })\n\nconst m = machine({\n  context: z.object({ allowed: z.boolean() }),\n  initialContext: { allowed: true },\n  initial: 'off',\n  states: ({ ctx }) => ({\n    off: { on: [on(Toggle, { target: 'on', guard: () => ctx.allowed === true })] },\n    on: { on: [on(Toggle, { target: 'off' })] },\n  }),\n})",
              ),
              ui.div({ class: 'grid gap-3' }, [
                ui.div({ class: pane }, [ui.span({}, ['contracts.ts']), ui.span({}, [t.decision])]),
                ctx.missing === false
                  ? code(
                      "contract(m, {\n  given: { state: 'off' },\n  when: [{ send: Toggle, payload: {} }],\n  expect: { state: 'on' },\n})",
                    )
                  : ui.div({ class: 'border-4 border-red p-4' }, [
                      ui.strong({}, [t.contractRemoved]),
                      ui.p({}, [t.contractRemovedBody]),
                    ]),
                ui.p({ class: 'text-xs' }, [t.excerpts]),
              ]),
            ]),
            ui.div({ class: 'grid content-start gap-4' }, [
              ui.ol({ class: 'grid gap-2', 'aria-label': t.stagesLabel }, [
                ...[
                  [t.stageSource, t.stageSourceBody, ['idle', 'source', 'brokenSource']],
                  [t.stageIr, t.stageIrBody, ['ir', 'brokenIr']],
                  [t.stageValidator, t.stageValidatorBody, ['validated', 'blocked']],
                  [t.stageCompiler, t.stageCompilerBody, ['compiled']],
                  [t.stageRuntime, t.stageRuntimeBody, ['done']],
                ].map(([title, description, states], index) =>
                  ui.li(
                    {
                      class: 'relative flex items-center gap-3 overflow-hidden border-4 border-ink px-3 py-2',
                    },
                    [
                      ui.span({ class: 'font-mono text-xs font-bold text-ember' }, [String(index + 1)]),
                      ui.div({ class: 'grid flex-1' }, [
                        ui.strong({ class: 'uppercase' }, [title as typeof t.lead]),
                        ui.small({}, [description as typeof t.lead]),
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
                          ui.span({ class: 'relative text-ember', 'aria-label': t.currentStage }, ['●']),
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
                        ui.p({ class: 'font-black uppercase' }, [t.idleTitle]),
                        ui.p({}, [t.idleBody]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['source', 'brokenSource'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, [t.sourceTitle]),
                        ui.p({}, [t.sourceBody]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['ir', 'brokenIr'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, [t.irTitle]),
                        code('off ── Toggle ──▶ on\non  ── Toggle ──▶ off'),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['validated'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, [t.validatedTitle]),
                        ui.p({}, [t.validatedBody]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['compiled'],
                    [
                      ui.div({}, [
                        ui.p({ class: 'font-black uppercase' }, [t.compiledTitle]),
                        ui.p({}, [t.compiledBody]),
                      ]),
                    ],
                    'fade',
                  ),
                  when(
                    ['done'],
                    [
                      ui.div({}, [
                        ui.div({ class: 'border-l-8 border-green pl-3' }, [
                          ui.p({ class: 'font-black uppercase' }, [t.doneTitle]),
                          ui.p({}, [t.doneBody]),
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
                          ui.p({ class: 'font-black uppercase' }, [t.blockedTitle]),
                          ui.code({}, ['HZ016 · uncovered transition']),
                          ui.p({}, [t.blockedBody]),
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
                  [t.runExample],
                ),
                ui.button(
                  {
                    type: 'button',
                    class: 'border-4 border-ink px-4 py-1.5 font-black uppercase',
                    on: { click: ui.send(SetContract, { missing: ctx.missing === false }) },
                  },
                  [ctx.missing === false ? t.removeContract : t.restoreContract],
                ),
                ui.div({ class: 'h-5 min-w-0 flex-1' }, [
                  when(
                    ['source', 'ir', 'validated', 'compiled', 'brokenSource', 'brokenIr'],
                    [ui.p({ class: 'font-mono text-xs', role: 'status' }, [t.running])],
                    'fade',
                  ),
                ]),
              ]),
            ]),
          ]),
          ui.noscript({}, [ui.p({ class: 'mx-auto mt-6 max-w-6xl font-mono text-xs' }, [t.noscript])]),
        ],
      ),
      ui.section(
        {
          class: 'mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-[22rem_minmax(0,1fr)]',
          'aria-labelledby': 'render-heading',
        },
        [
          ui.div({ class: 'grid content-start gap-3' }, [
            ui.p({ class: kicker }, [t.exploreRender]),
            ui.h2({ id: 'render-heading', class: 'whitespace-pre-line text-3xl font-black uppercase' }, [
              t.renderHeading,
            ]),
            ui.p({}, [t.renderLead]),
            ui.a(
              {
                href: ui.link(chapter, { slug: 'derived-rendering' }),
                class: 'font-bold underline decoration-red',
              },
              [t.readDerived],
            ),
          ]),
          ui.div({ class: 'grid gap-6' }, [
            ui.div({ class: 'grid gap-4' }, [
              ui.fieldset({ class: 'flex flex-wrap gap-2' }, [
                ui.legend({ class: 'mb-2 font-mono text-xs font-bold uppercase' }, [t.dataScope]),
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
                ui.legend({ class: 'mb-2 font-mono text-xs font-bold uppercase' }, [t.freshness]),
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
                ui.legend({ class: 'mb-2 font-mono text-xs font-bold uppercase' }, [t.machineBinding]),
                ...([false, true] as const).map((value) =>
                  ui.button(
                    {
                      type: 'button',
                      class: pressed,
                      'aria-pressed': ctx.binding === value,
                      on: { click: ui.set(ctx.binding, value) },
                    },
                    [value ? t.bound : t.none],
                  ),
                ),
              ]),
            ]),
            ui.div({ class: 'border-4 border-ink bg-white', 'aria-live': 'polite', 'aria-atomic': 'true' }, [
              ui.div({ class: 'flex justify-between bg-ink px-3 py-2 font-mono text-xs text-paper' }, [
                ui.span({}, [t.yourPage]),
                ui.span({}, [t.illustration]),
              ]),
              ui.div({ class: 'grid gap-3 p-4' }, [
                ui.div({ class: 'flex justify-between border-2 border-dashed border-ink p-3' }, [
                  ui.span({}, [t.staticShell]),
                  ui.small({}, [t.staticShellBody]),
                ]),
                ui.div(
                  {
                    class: 'border-4 p-3',
                    toggle: { 'border-red': ctx.scope === 'user', 'border-ink': ctx.scope !== 'user' },
                  },
                  [
                    ui.small({}, [t.queryRegion]),
                    ctx.scope === 'user'
                      ? [ui.h3({}, [t.privateTitle]), ui.p({}, [t.privateBody])]
                      : [
                          ctx.freshness === 'static' && [
                            ui.h3({}, [t.staticTitle]),
                            ui.p({}, [t.staticBody]),
                          ],
                          ctx.freshness === 'revalidate' && [ui.h3({}, [t.isrTitle]), ui.p({}, [t.isrBody])],
                          ctx.freshness === 'swr' && [ui.h3({}, [t.swrTitle]), ui.p({}, [t.swrBody])],
                          ctx.freshness === 'live' && [ui.h3({}, [t.liveTitle]), ui.p({}, [t.liveBody])],
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
                      ? [ui.strong({}, [t.islandTitle]), ui.p({}, [t.islandBody])]
                      : [ui.strong({}, [t.plainTitle]), ui.p({}, [t.plainBody])],
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
                    ? ui.span({}, [t.dataStatic])
                    : ui.span({}, [t.dataServer]),
                  ctx.binding === true
                    ? ui.span({}, [t.interactionClient])
                    : ui.span({}, [t.interactionNone]),
                ],
              ),
            ]),
            ui.p({ class: 'font-mono text-xs' }, [t.modelNote]),
          ]),
        ],
      ),
      ui.section({ id: 'design-chapters', class: 'border-t-4 border-ink bg-ink px-5 py-14 text-paper' }, [
        ui.div({}, [
          ui.p({ class: 'font-mono text-xs font-bold uppercase text-red' }, [t.deeper]),
          ui.h2({ class: 'text-3xl font-black uppercase md:text-5xl' }, [t.reasoning]),
          ui.p({}, [t.sixChapters]),
        ]),
        ui.query(
          listChapters,
          { locale },
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
            failed: { Unexpected: () => ui.p({ role: 'alert' }, [t.chaptersUnavailable]) },
          },
        ),
        ui.div({ class: 'mt-8 flex flex-wrap items-center gap-6' }, [
          ui.a(
            {
              href: ui.link(doc, { slug: 'getting-started' }),
              class: 'bg-red px-4 py-3 font-black uppercase text-ink',
            },
            [t.firstFeature],
          ),
          ui.a({ href: ui.link(trials, null), class: 'font-bold underline' }, [t.measured]),
        ]),
      ]),
    ]),
})
export const lab = feature({
  id: 'lab',
  intent: { summary: 'Interactive, explicitly illustrative walkthrough of Hozu validation and rendering' },
  imports: [content],
  declarations: [{ Run, SetContract, m, How, ...contracts }, messages],
})
