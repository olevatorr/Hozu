import { ui, type Val } from '@hozu/core'
import { changelog, chapter, devtools, doc, home, how, trial, trials } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { CatchCard } from '../../site/catch-card.ts'
import { CodeBlock } from '../../site/code-block.ts'
import { apiDemo, measureDemo, selectDemo } from '../../site/demos.ts'
import { Display, Heading } from '../../site/display.ts'
import { Joint } from '../../site/joint.ts'
import { peg } from '../../site/peg.ts'
import { Receipt, ReceiptLine } from '../../site/receipt.ts'
import { Section } from '../../site/section.ts'
import { SpeedTable } from '../../site/speed-table.ts'
import { StatRow, StatTable } from '../../site/stat-table.ts'
import { Step, Steps } from '../../site/steps.ts'
import { Ticker } from '../../site/ticker.ts'
import { support } from '../content/chrome.ts'
import { catches, claim, speed, speedSource } from '../content/claims.ts'
import { getStart, listChapters } from '../content/model.ts'
import { figmaCards } from './devtools.ts'
import { films } from './media.ts'
import { homeText as t } from './messages.ts'
import { Break, Fix, getPlayground, m } from './model.ts'

const claimLink = (id: string, text: Val<string>) =>
  ui.a(
    {
      href: ui.link(trial, { slug: claim(id).trial }),
      'data-claim': id,
      class: 'font-bold underline decoration-red',
    },
    [text],
  )
const claimLabels: Record<string, Val<string>> = {
  cold: t.claimCold,
  known: t.claimKnown,
  coldCalls: t.claimColdCalls,
  passed: t.claimPassed,
  nuxtSilent: t.claimNuxtSilent,
  js: t.claimJs,
}
const stories: Record<string, Val<string>> = {
  HZ049: t.storyHZ049,
  HZ054: t.storyHZ054,
  HZ091: t.storyHZ091,
  HZ057: t.storyHZ057,
}
const shown = (id: string) => {
  const c = claim(id)
  return c.of ? t.ofValue({ a: c.of[0], b: c.of[1] }) : c.value
}
const receiptLines = (ids: string[]) =>
  ui.div(
    {},
    ids.map((id) =>
      ui.use(ReceiptLine, {
        props: {
          claim: id,
          label: claimLabels[id] ?? claim(id).label,
          value: shown(id),
          href: ui.link(trial, { slug: claim(id).trial }),
        },
      }),
    ),
  )
const curve = (slug: string, alt: Val<string>) =>
  ui.img({
    src: ui.asset(new URL(`../../../docs/trials/${slug}.svg`, import.meta.url)),
    width: 960,
    height: 390,
    alt,
    class: 'mt-6 w-full border-4 border-ink bg-white',
  })
const rise = (text: Val<string>, accent: boolean) =>
  ui.span({}, [
    ui.span({ class: accent ? 'inline-block animate-rise text-red' : 'inline-block animate-rise' }, [text]),
    ' ',
  ])
const choice =
  'border-4 border-paper px-3 py-2 font-mono text-xs font-bold aria-pressed:bg-paper aria-pressed:text-ink'

export const Home = ui.view({
  machine: m,
  route: home,
  render: ({ ctx, is, locale }) =>
    ui.main({ id: 'main' }, [
      ui.div({ class: 'relative overflow-hidden bg-paper' }, [
        ui.div({ class: 'mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center' }, [
          ui.div({}, [
            ui.use(Display, {}, [
              rise(t.word1, false),
              rise(t.word2, false),
              rise(t.word3, false),
              rise(t.word4, false),
              rise(t.word5, true),
              rise(t.word6, true),
              rise(t.word7, true),
            ]),
            ui.p({ class: 'mt-5 max-w-md text-lg' }, [t.lead]),
            ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
              ui.use(Button, { props: { href: ui.link(doc, { slug: 'getting-started' }) } }, [
                t.startBuilding,
              ]),
              ui.use(Button, { variant: { intent: 'outline' }, props: { href: ui.link(trials, null) } }, [
                t.seeProof,
              ]),
            ]),
            ui.p({ class: 'mt-8 font-mono text-xs font-bold text-ember' }, [t.pressHint]),
            ui.div({ class: 'mt-3 flex max-w-xl items-end gap-3' }, [
              ui.div(
                {
                  class: 'min-w-0 flex-1 border-4 border-ink bg-white shadow-[8px_8px_0_var(--color-ink)]',
                  toggle: { 'animate-shake': ctx.broken },
                },
                [
                  ui.div(
                    {
                      class:
                        'flex items-center justify-between bg-ink px-3 py-2 text-sm font-bold text-paper',
                    },
                    [
                      ui.span({}, [
                        'notes · ',
                        ui.span({ class: 'hidden sm:inline' }, [t.signedInAs]),
                        'ada',
                      ]),
                      is(['broken'])
                        ? ui.button(
                            {
                              type: 'button',
                              class: 'shrink-0 whitespace-nowrap bg-green px-3 py-1 font-black text-ink',
                              on: { click: ui.send(Fix, {}) },
                            },
                            [t.applyFix],
                          )
                        : ui.button(
                            {
                              type: 'button',
                              class: 'shrink-0 whitespace-nowrap bg-red px-3 py-1 font-black text-ink',
                              toggle: { 'animate-nudge': !ctx.tried },
                              on: { click: ui.send(Break, {}) },
                            },
                            [t.aiChange],
                          ),
                    ],
                  ),
                  ui.p({ class: 'px-3 py-2' }, [t.buyMilk]),
                  ui.if(
                    ctx.broken === true,
                    [ui.p({ class: 'overflow-hidden bg-red/10 px-3 py-2' }, [t.bobSecret])],
                    [],
                    'intrude',
                  ),
                  ui.p(
                    {
                      class:
                        'border-t-4 border-ink px-3 py-2 font-mono text-xs transition-colors duration-300',
                      toggle: { 'bg-red text-ink': ctx.broken, 'animate-pass': !ctx.broken && ctx.tried },
                      'aria-live': 'polite',
                    },
                    [ctx.broken ? t.brokenLine : '✔ types ok · 0 errors · lock current'],
                  ),
                ],
              ),
              ui.div(
                {
                  class:
                    'relative flex h-[136px] w-24 shrink-0 items-end justify-start sm:h-[196px] sm:w-[138px]',
                },
                [
                  ui.if(
                    ctx.broken === true,
                    [peg('wait', 96, 'h-auto w-24 sm:w-[138px]', false, t.pegWait)],
                    [],
                    'pop',
                  ),
                  ui.if(
                    !ctx.broken && ctx.tried,
                    [peg('fits', 96, 'h-auto w-24 sm:w-[138px]', false, t.pegFits)],
                    [],
                    'pop',
                  ),
                  ui.if(
                    !ctx.tried,
                    [peg('hello', 96, 'h-auto w-[53px] sm:w-[77px]', false, t.pegHello)],
                    [],
                    'pop',
                  ),
                ],
              ),
            ]),
          ]),
          ui.use(Joint, { props: { split: ctx.broken } }),
        ]),
        ui.use(
          Ticker,
          {
            slots: {
              source: ui.a({ href: ui.link(trial, { slug: claim('cold').trial }), class: 'underline' }, [
                t.sources,
              ]),
            },
          },
          [
            ui.span({}, [t.tickerPassed({ v: shown('passed') }), ' ■']),
            ui.span({}, [t.tickerLearning({ v: claim('cold').value }), ' ■']),
            ui.span({}, [t.tickerKnown({ v: claim('known').value }), ' ■']),
            ui.span({}, [t.tickerChecked, ' ■']),
          ],
        ),
      ]),
      ui.div({}, [
        ui.use(Section, { props: { kicker: t.watchKicker } }, [
          ui.use(Heading, {}, [t.watchHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.watchLead]),
          ui.video(
            {
              controls: true,
              preload: 'none',
              playsinline: true,
              poster: ui.asset(new URL('../../assets/video/hozu-site-poster.jpg', import.meta.url)),
              width: 1280,
              height: 720,
              class:
                'mt-8 aspect-video h-auto w-full border-4 border-ink bg-ink shadow-[8px_8px_0_var(--color-ink)]',
            },
            [
              ui.source({
                src: films.site,
                type: 'video/mp4',
              }),
            ],
          ),
          ui.p({ class: 'mt-3 font-mono text-xs' }, [t.captions]),
        ]),
        ui.use(Section, { props: { kicker: t.billKicker } }, [
          ui.use(Heading, {}, [t.billHeading]),
          ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[28rem_minmax(0,1fr)]' }, [
            ui.use(Receipt, {
              props: { pay: t.youPay, get: t.youGet },
              slots: {
                pay: receiptLines(['cold', 'known', 'coldCalls']),
                get: receiptLines(['passed', 'nuxtSilent', 'js']),
              },
            }),
            ui.div({ class: 'grid content-start gap-4 text-lg' }, [
              ui.p({}, [
                t.billCostA,
                claimLink('cold', t.nuxtTokens({ v: claim('cold').value })),
                t.billCostB,
                claimLink('known', t.knownValue({ v: claim('known').value })),
                t.billCostC,
              ]),
              ui.p({}, [
                t.billBuysA,
                claimLink('nuxtSilent', t.silentChanges({ v: shown('nuxtSilent') })),
                t.billBuysB,
              ]),
              ui.p({ class: 'font-mono text-xs' }, [
                t.billNoteA,
                claimLink('oldCost', t.onHozu07({ v: claim('oldCost').value })),
                t.comma,
                claimLink('tokens', t.on08({ v: claim('tokens').value })),
                t.period,
              ]),
            ]),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.speedKicker } }, [
          ui.use(Heading, {}, [t.speedHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.speedLead]),
          ui.use(SpeedTable, {
            class: 'mt-8',
            props: {
              caption: t.speedCaption,
              rows: speed,
              labels: {
                framework: t.colFramework,
                requests: t.colRequests,
                requestsShort: t.colRequestsShort,
                js: t.colJs,
                jsShort: t.colJsShort,
                interactive: t.colInteractive,
                interactiveShort: t.colInteractiveShort,
              },
            },
          }),
          ui.p({ class: 'mt-3 max-w-3xl font-mono text-xs' }, [
            t.speedNote,
            ui.a({ href: speedSource, class: 'underline' }, [t.howMeasured]),
            ' · ',
            ui.a(
              {
                href: 'https://github.com/olevatorr/Hozu/blob/main/docs/benchmarks/0001-frameworks.md',
                class: 'underline',
              },
              [t.librariesAlone],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.workKicker } }, [
          ui.use(Heading, {}, [t.workHeading]),
          ui.use(Steps, { class: 'mt-8' }, [
            ui.use(Step, { props: { title: t.workCreate, body: t.workCreateBody } }),
            ui.use(Step, { props: { title: t.workAsk, body: t.workAskBody } }),
            ui.use(Step, { props: { title: t.workChecks, body: t.workChecksBody } }),
          ]),
          ui.query(
            getStart,
            {},
            {
              ready: (start) =>
                ui.div(
                  {
                    class:
                      'prose mt-8 max-w-none prose-pre:bg-ink prose-pre:text-paper prose-figcaption:text-ink',
                  },
                  [ui.use(CodeBlock, {}, [ui.html(start.html)])],
                ),
              pending: null,
              failed: {
                Unexpected: () => ui.p({ role: 'alert' }, [t.startUnavailable]),
              },
            },
          ),
        ]),
        ui.use(Section, { props: { kicker: t.agentKicker } }, [
          ui.use(Heading, {}, [t.agentHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.agentLead]),
          ui.use(Steps, { class: 'mt-8' }, [
            ui.use(Step, { props: { title: 'hozu check', body: t.agentCheckBody } }),
            ui.use(Step, { props: { title: 'hozu browse', body: t.agentBrowseBody } }),
            ui.use(Step, { props: { title: t.agentHold, body: t.agentHoldBody } }),
          ]),
          ui.p({ class: 'mt-6 max-w-2xl' }, [
            t.agentStory,
            ui.a({ href: ui.link(changelog, null), class: 'underline decoration-red' }, [t.agentChanged]),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'cli' }) } }, [t.agentCommands]),
            ui.use(
              Button,
              { variant: { intent: 'outline' }, props: { href: ui.link(doc, { slug: 'ai-agents' }) } },
              [t.agentWorking],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.accessKicker } }, [
          ui.use(Heading, {}, [t.accessHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.accessLead]),
          ui.use(Steps, { class: 'mt-8' }, [
            ui.use(Step, { props: { title: "access: 'signedIn'", body: t.accessDeclareBody } }),
            ui.use(Step, { props: { title: 'Forbidden', body: t.accessRefuseBody } }),
            ui.use(Step, { props: { title: t.accessTry, body: t.accessTryBody } }),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'data' }) } }, [t.accessButton]),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.dataKicker } }, [
          ui.use(Heading, {}, [t.dataHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.dataLead]),
          ui.use(Steps, { class: 'mt-8' }, [
            ui.use(Step, { props: { title: "runs: 'server'", body: t.dataServerBody } }),
            ui.use(Step, { props: { title: "runs: 'either'", body: t.dataEitherBody } }),
            ui.use(Step, { props: { title: "runs: 'browser'", body: t.dataBrowserBody } }),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'data' }) } }, [t.dataButton]),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.goKicker } }, [
          ui.use(Heading, {}, [t.goHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.goLead]),
          ui.use(Steps, { class: 'mt-8' }, [
            ui.use(Step, { props: { title: 'remote()', body: t.goRemoteBody } }),
            ui.use(Step, { props: { title: 'hozu gen', body: t.goGenBody } }),
            ui.use(Step, { props: { title: t.goTried, body: t.goTriedBody } }),
          ]),
          ui.p({ class: 'mt-3 max-w-3xl font-mono text-xs' }, [t.goNote]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'go' }) } }, [t.goButton]),
            ui.a(
              {
                href: 'https://github.com/olevatorr/Hozu/tree/main/examples/notes-go',
                class: 'self-center underline',
              },
              [t.goNotes],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.testKicker } }, [
          ui.use(Heading, {}, [t.testHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.testLead]),
          ui.div({ class: 'mt-8' }, [apiDemo(t.testDemo)]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(devtools, null) } }, [t.testButton]),
            ui.use(
              Button,
              { variant: { intent: 'outline' }, props: { href: ui.link(doc, { slug: 'environment' }) } },
              [t.testEnvironment],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.scaleKicker } }, [
          ui.use(Heading, {}, [t.scaleHeading]),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.scaleLead]),
          ui.use(Steps, { class: 'mt-8' }, [
            ui.use(Step, { props: { title: t.scaleCheck, body: t.scaleCheckBody } }),
            ui.use(Step, { props: { title: t.scalePage, body: t.scalePageBody } }),
            ui.use(Step, { props: { title: t.scaleServers, body: t.scaleServersBody } }),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'deploying' }) } }, [t.scaleButton]),
            ui.a(
              {
                href: 'https://github.com/olevatorr/Hozu/blob/main/docs/benchmarks/0003-scale.md',
                class: 'self-center underline',
              },
              [t.howMeasured],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'DevTools' } }, [
          ui.use(Heading, {}, [t.devtoolsHeading]),
          ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center' }, [
            selectDemo(t.devtoolsDemo),
            ui.div({ class: 'grid content-start gap-4 text-lg' }, [
              ui.p({}, [t.devtoolsSelect]),
              ui.p({}, [t.devtoolsRequest]),
              ui.p({}, [t.devtoolsBack]),
              ui.div({ class: 'mt-2 flex flex-wrap gap-3' }, [
                ui.use(Button, { props: { href: ui.link(devtools, null) } }, [t.devtoolsButton]),
              ]),
            ]),
          ]),
        ]),
        ui.use(Section, { props: { kicker: t.designKicker } }, [
          ui.use(Heading, {}, [t.designHeading]),
          ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center' }, [
            measureDemo(t.designDemo),
            ui.div({ class: 'grid content-start gap-4 text-lg' }, [
              ui.p({}, [t.designKeys]),
              ui.p({}, [t.designAssets]),
              ui.div({ class: 'mt-2 flex flex-wrap gap-3' }, [
                ui.use(Button, { props: { href: ui.link(devtools, null) } }, [t.designButton]),
              ]),
            ]),
          ]),
          figmaCards('border-ink', [
            ['Shift+Enter · Enter · Tab', t.figmaSelect],
            ['Alt', t.figmaAlt],
            ['W × H', t.figmaSize],
            [t.figmaPanel, t.figmaPanelBody],
            [t.figmaVariables, t.figmaVariablesBody],
            [t.figmaComments, t.figmaCommentsBody],
          ]),
        ]),
        ui.use(
          Section,
          {
            variant: { tone: 'ink' },
            props: { kicker: t.catchesKicker },
          },
          [
            ui.use(Heading, {}, [t.catchesHeading]),
            ui.p({ class: 'mt-4 max-w-2xl' }, [t.catchesLead]),
            ui.div(
              { class: 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4' },
              catches.map((c) =>
                ui.use(CatchCard, {
                  props: {
                    code: c.code,
                    name: c.name,
                    story: stories[c.code] ?? c.story,
                    message: c.message,
                    fix: c.fix,
                  },
                }),
              ),
            ),
          ],
        ),
      ]),
      ui.use(
        Section,
        {
          variant: { tone: 'ink' },
          props: { kicker: t.componentsKicker },
        },
        [
          ui.use(Heading, {}, [t.componentsHeading]),
          ui.p({ class: 'mt-4 max-w-2xl' }, [t.componentsLead]),
          ui.div({ class: 'mt-6 flex gap-3', role: 'group', 'aria-label': t.variantGroup }, [
            ui.button(
              {
                type: 'button',
                class: choice,
                'aria-pressed': ctx.intent === 'solid',
                on: { click: ui.set(ctx.intent, 'solid') },
              },
              ['intent: solid'],
            ),
            ui.button(
              {
                type: 'button',
                class: choice,
                'aria-pressed': ctx.intent === 'outline',
                on: { click: ui.set(ctx.intent, 'outline') },
              },
              ['intent: outline'],
            ),
          ]),
          ui.query(
            getPlayground,
            {},
            {
              ready: (play) =>
                ui.div({ class: 'mt-6 grid gap-6 lg:grid-cols-3' }, [
                  ui.div({ class: 'grid place-items-center border-4 border-paper bg-paper p-8' }, [
                    ctx.intent === 'solid'
                      ? ui.use(Button, { variant: { intent: 'solid' }, props: { href: '#' } }, [
                          t.previewLabel,
                        ])
                      : ui.use(Button, { variant: { intent: 'outline' }, props: { href: '#' } }, [
                          t.previewLabel,
                        ]),
                  ]),
                  ui.div({ class: 'prose prose-invert min-w-0 max-w-none prose-figcaption:text-paper' }, [
                    ui.use(CodeBlock, {}, [ui.html(play.source)]),
                  ]),
                  ui.div({ class: 'min-w-0' }, [
                    ui.p({ class: 'font-mono text-xs font-bold text-red' }, [
                      'hozu render site.Button --variant intent=',
                      ctx.intent,
                    ]),
                    ui.pre(
                      {
                        class: 'mt-2 overflow-x-auto border-4 border-paper p-3 font-mono text-xs',
                        tabindex: 0,
                      },
                      [ctx.intent === 'solid' ? play.solid : play.outline],
                    ),
                  ]),
                ]),
              pending: null,
              failed: { Unexpected: () => ui.p({ role: 'alert' }, [t.playgroundUnavailable]) },
            },
          ),
          ui.p({ class: 'mt-6 max-w-2xl text-sm' }, [
            t.overrideNote,
            ui.a({ href: ui.link(doc, { slug: 'views' }), class: 'underline decoration-red' }, [
              t.readComponents,
            ]),
          ]),
          ui.h3({ class: 'mt-16 text-2xl font-black uppercase' }, [t.jointHeading]),
          ui.p({ class: 'mt-3 max-w-2xl' }, [t.jointLead]),
          ui.query(
            getPlayground,
            {},
            {
              ready: (play) =>
                ui.div({ class: 'prose prose-invert mt-6 max-w-none prose-figcaption:text-paper' }, [
                  ui.use(CodeBlock, {}, [ui.html(play.joint)]),
                ]),
              pending: null,
              failed: { Unexpected: () => ui.p({ role: 'alert' }, [t.sourceUnavailable]) },
            },
          ),
        ],
      ),
      ui.use(Section, { props: { kicker: t.hoodKicker } }, [
        ui.use(Heading, {}, ['feature() → IR → validator → compiler → runtime']),
        ui.p({ class: 'mt-4 max-w-3xl text-lg' }, [t.hoodLead]),
        ui.div({ class: 'mt-6' }, [ui.use(Button, { props: { href: ui.link(how, null) } }, [t.hoodButton])]),
        ui.query(
          listChapters,
          { locale },
          {
            ready: (items) =>
              ui.ul({ class: 'mt-8 grid gap-2 md:grid-cols-2' }, [
                ui.each(items, 'slug', (item) =>
                  ui.li({}, [
                    ui.a(
                      {
                        href: ui.link(chapter, { slug: item.slug }),
                        class: 'font-bold underline decoration-red',
                      },
                      [item.title],
                    ),
                  ]),
                ),
              ]),
            pending: null,
            failed: { Unexpected: () => ui.p({ role: 'alert' }, [t.chaptersUnavailable]) },
          },
        ),
      ]),
      ui.div({}, [
        ui.use(Section, { props: { kicker: t.trialsKicker } }, [
          ui.use(Heading, {}, [t.trialsHeading]),
          ui.p({ class: 'mt-4 max-w-3xl' }, [
            t.trialsA,
            claimLink('cold', t.nuxtTokens({ v: claim('cold').value })),
            t.trialsB,
            claimLink('known', t.onceKnown({ v: claim('known').value })),
            t.trialsC,
          ]),
          ui.use(
            StatTable,
            {
              class: 'mt-6',
              props: {
                caption: t.table24Caption,
                before: 'Hozu 0.14',
                after: 'Nuxt 4.5.2',
              },
            },
            [
              ui.use(StatRow, { props: { label: t.claimPassed, before: '29', after: '26' } }),
              ui.use(StatRow, { props: { label: t.rowSilent, before: '0', after: '3' } }),
              ui.use(StatRow, {
                props: { label: t.rowUnseen, before: claim('cold').value, after: t.baseline },
              }),
              ui.use(StatRow, {
                props: { label: t.rowKnown, before: claim('known').value, after: t.baseline },
              }),
            ],
          ),
          ui.p({ class: 'mt-10 max-w-3xl' }, [
            t.olderA,
            claimLink('tokens', t.tokensPerChange({ v: claim('tokens').value })),
            t.olderB,
            claimLink('oldCost', t.onHozu07({ v: claim('oldCost').value })),
            t.olderC,
            claimLink('regressions', t.regressions({ v: claim('regressions').value })),
            t.olderD,
            claimLink('silent', t.silentFailures({ v: claim('silent').value })),
            t.olderE,
            claimLink('old', t.regressionFailures({ v: claim('old').value })),
            t.olderF,
            claimLink('oldSilent', t.steps({ v: claim('oldSilent').value })),
            t.olderG,
          ]),
          ui.use(
            StatTable,
            {
              class: 'mt-6',
              props: {
                caption: t.table21Caption,
                before: 'Hozu 0.7',
                after: 'Hozu 0.8',
              },
            },
            [
              ui.use(StatRow, {
                props: {
                  label: t.rowRegressions,
                  before: claim('old').value,
                  after: claim('regressions').value,
                },
              }),
              ui.use(StatRow, {
                props: {
                  label: t.rowSilentSteps,
                  before: claim('oldSilent').value,
                  after: claim('silent').value,
                },
              }),
              ui.use(StatRow, {
                props: { label: t.rowCost, before: claim('oldCost').value, after: claim('tokens').value },
              }),
            ],
          ),
          curve('0021-0-8-long-run', t.curveAlt),
          ui.p({ class: 'mt-2 font-mono text-xs' }, [
            t.rawRecords,
            ui.a({ href: ui.link(trial, { slug: claim('tokens').trial }), class: 'underline' }, [t.read0021]),
            ' · ',
            ui.a({ href: ui.link(trial, { slug: claim('cold').trial }), class: 'underline' }, [t.read0024]),
            ' · ',
            ui.a({ href: ui.link(trials, null), class: 'underline' }, [t.allTrials]),
          ]),
        ]),
        ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: t.startKicker } }, [
          ui.div({ class: 'flex items-end justify-between gap-6' }, [
            ui.use(Heading, {}, [t.startHeading]),
            peg('hello', 120, 'hidden h-auto shrink-0 sm:block', true),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-4' }, [
            ui.use(
              Button,
              { variant: { intent: 'light' }, props: { href: ui.link(doc, { slug: 'getting-started' }) } },
              [t.startBuilding],
            ),
            ui.use(
              Button,
              { variant: { intent: 'lightOutline' }, props: { href: 'https://github.com/olevatorr/Hozu' } },
              ['GitHub'],
            ),
            ui.use(Button, { variant: { intent: 'lightOutline' }, props: { href: support } }, [t.coffee]),
          ]),
        ]),
        ui.use(
          Ticker,
          {
            slots: {
              source: ui.a({ href: ui.link(trial, { slug: claim('cold').trial }), class: 'underline' }, [
                t.sources,
              ]),
            },
          },
          [
            ui.span({}, [t.tickerPassed({ v: shown('passed') }), ' ■']),
            ui.span({}, [t.tickerKnownTokens({ v: claim('known').value }), ' ■']),
            ui.span({}, [t.tickerJs({ v: claim('js').value }), ' ■']),
            ui.span({}, [t.tickerChecked, ' ■']),
          ],
        ),
      ]),
    ]),
})
