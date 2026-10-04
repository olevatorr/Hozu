import { ui } from '@hozu/core'
import { chapter, devtools, doc, home, how, trial, trials } from '../../routes.ts'
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
import { StatTable } from '../../site/stat-table.ts'
import { Steps } from '../../site/steps.ts'
import { Ticker } from '../../site/ticker.ts'
import { support } from '../content/chrome.ts'
import { catches, claim, speed, speedSource } from '../content/claims.ts'
import { getStart, listChapters } from '../content/model.ts'
import { figmaCards } from './devtools.ts'
import { films } from './media.ts'
import { Break, Fix, getPlayground, m, Pick } from './model.ts'

const claimLink = (id: string, text: string) =>
  ui.a(
    {
      href: ui.link(trial, { slug: claim(id).trial }),
      'data-claim': id,
      class: 'font-bold underline decoration-red',
    },
    [text],
  )
const receiptLines = (ids: string[]) =>
  ui.div(
    {},
    ids.map((id) =>
      ui.use(ReceiptLine, {
        props: {
          claim: id,
          label: claim(id).label,
          value: claim(id).value,
          href: ui.link(trial, { slug: claim(id).trial }),
        },
      }),
    ),
  )
const curve = (slug: string, alt: string) =>
  ui.img({
    src: ui.asset(new URL(`../../../docs/trials/${slug}.svg`, import.meta.url)),
    width: 960,
    height: 390,
    alt,
    class: 'mt-6 w-full border-4 border-ink bg-white',
  })
const choice =
  'border-4 border-paper px-3 py-2 font-mono text-xs font-bold aria-pressed:bg-paper aria-pressed:text-ink'

export const Home = ui.view({
  machine: m,
  route: home,
  render: ({ ctx, when }) =>
    ui.main({ id: 'main' }, [
      ui.div({ class: 'relative overflow-hidden bg-paper' }, [
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
              'Your AI has never seen Hozu. A change still costs close to what Nuxt does, and every change is checked before it reaches anyone.',
            ]),
            ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
              ui.use(Button, { props: { href: ui.link(doc, { slug: 'getting-started' }) } }, [
                'Start building →',
              ]),
              ui.use(Button, { variant: { intent: 'outline' }, props: { href: ui.link(trials, null) } }, [
                'See the proof',
              ]),
            ]),
            ui.p({ class: 'mt-8 font-mono text-xs font-bold text-ember' }, [
              '↓ Press AI CHANGE: an agent edits this app, and Hozu checks the change.',
            ]),
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
                        ui.span({ class: 'hidden sm:inline' }, ['signed in as ']),
                        'ada',
                      ]),
                      when(
                        ['broken'],
                        [
                          ui.button(
                            {
                              type: 'button',
                              class: 'shrink-0 whitespace-nowrap bg-green px-3 py-1 font-black text-ink',
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
                              class: 'shrink-0 whitespace-nowrap bg-red px-3 py-1 font-black text-ink',
                              toggle: { 'animate-nudge': !ctx.tried },
                              on: { click: ui.send(Break, {}) },
                            },
                            ['AI CHANGE'],
                          ),
                        ],
                      ),
                    ],
                  ),
                  ui.p({ class: 'px-3 py-2' }, ['Buy milk']),
                  ui.if(
                    ctx.broken === true,
                    [ui.p({ class: 'overflow-hidden bg-red/10 px-3 py-2' }, ["Bob's secret · bob ⚠"])],
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
                    [
                      ctx.broken
                        ? '✘ HZ049 your notes would be cached and shown to bob'
                        : '✔ types ok · 0 errors · lock current',
                    ],
                  ),
                ],
              ),
              ui.div(
                {
                  class:
                    'relative flex h-[136px] w-24 shrink-0 items-end justify-start sm:h-[196px] sm:w-[138px]',
                },
                [
                  ui.if(ctx.broken === true, [peg('wait', 96, 'h-auto w-24 sm:w-[138px]')], [], 'pop'),
                  ui.if(!ctx.broken && ctx.tried, [peg('fits', 96, 'h-auto w-24 sm:w-[138px]')], [], 'pop'),
                  ui.if(!ctx.tried, [peg('hello', 96, 'h-auto w-[53px] sm:w-[77px]')], [], 'pop'),
                ],
              ),
            ]),
          ]),
          ui.use(Joint, { props: { split: ctx.broken } }),
        ]),
        ui.use(Ticker, {
          slots: {
            source: ui.a({ href: ui.link(trial, { slug: claim('cold').trial }), class: 'underline' }, [
              'Sources',
            ]),
          },
          props: {
            items: [
              `${claim('passed').value} changes passed every check`,
              `${claim('cold').value} Nuxt’s tokens while learning`,
              `${claim('known').value} once known`,
              'every change checked',
            ],
          },
        }),
      ]),
      ui.div({}, [
        ui.use(Section, { props: { kicker: 'Watch · 2 min' } }, [
          ui.use(Heading, {}, ['Two minutes. No code.']),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
            'You dream it, your AI builds it, and Peg, the red peg that locks the joint, checks every change before it reaches anyone. For vibe coders and designers.',
          ]),
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
          ui.p({ class: 'mt-3 font-mono text-xs' }, ['English captions · voice generated by elevenlabs.io']),
        ]),
        ui.use(Section, { props: { kicker: 'The bill' } }, [
          ui.use(Heading, {}, ['Your AI has never seen Hozu. It costs about what Nuxt does.']),
          ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[28rem_minmax(0,1fr)]' }, [
            ui.use(Receipt, {
              slots: {
                pay: receiptLines(['cold', 'known', 'coldCalls']),
                get: receiptLines(['passed', 'nuxtSilent', 'js']),
              },
            }),
            ui.div({ class: 'grid content-start gap-4 text-lg' }, [
              ui.p({}, [
                'Every model already knows Nuxt. Hozu it learns from our guide, in every session. Even so, a change costs ',
                claimLink('cold', `${claim('cold').value} Nuxt’s tokens`),
                ', and once the guide is known, ',
                claimLink('known', claim('known').value),
                ': about the same. What is left is learning, not the framework.',
              ]),
              ui.p({}, [
                'What it buys: over 29 changes, Hozu passed every check of every step. Nuxt silently broke a working export in ',
                claimLink('nuxtSilent', `${claim('nuxtSilent').value} changes`),
                ' while its typecheck and build stayed green. Your agent runs the checker and fixes what it finds before it says “done”.',
              ]),
              ui.p({ class: 'font-mono text-xs' }, [
                'One app, one model (Claude Opus), Hozu 0.14 against Nuxt 4.5.2. Earlier versions cost more: ',
                claimLink('oldCost', `${claim('oldCost').value} on Hozu 0.7`),
                ', ',
                claimLink('tokens', `${claim('tokens').value} on 0.8`),
                '.',
              ]),
            ]),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'Speed' } }, [
          ui.use(Heading, {}, ['Checked, and still the lightest page.']),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
            'The same page, 100 products and a cart counter, built with each framework and run in its own production server. Every request is rendered fresh. Only the parts that react to clicks ship JavaScript.',
          ]),
          ui.use(SpeedTable, {
            class: 'mt-8',
            props: { caption: 'One page, four frameworks, rendered per request', rows: speed },
          }),
          ui.p({ class: 'mt-3 max-w-3xl font-mono text-xs' }, [
            'One run on an Apple M4 Pro, Node 22.22.2, Chrome 154; browser timings with the CPU slowed four times. Next.js serving the page prerendered reaches 6,952 requests per second. With gzip accepted, Hozu answers 11,875 and Next.js 1,546; Nuxt and SvelteKit send their pages uncompressed. JavaScript sizes are all gzipped the same way. ',
            ui.a({ href: speedSource, class: 'underline' }, ['How we measured']),
            ' · ',
            ui.a(
              {
                href: 'https://github.com/olevatorr/Hozu/blob/main/docs/benchmarks/0001-frameworks.md',
                class: 'underline',
              },
              ['The libraries alone (React, Vue, Preact, Svelte)'],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'How you work' } }, [
          ui.use(Heading, {}, ['Three steps. Your agent does the typing.']),
          ui.use(Steps, {
            class: 'mt-8',
            props: {
              items: [
                {
                  id: '1',
                  title: '1 · Create',
                  body: 'One command makes the app and puts the Hozu guide next to it.',
                },
                {
                  id: '2',
                  title: '2 · Ask your agent',
                  body: '“Add sharing to my notes.” Or point at the screen with Hozu DevTools: it hands your agent the file and line.',
                },
                {
                  id: '3',
                  title: '3 · It checks itself',
                  body: 'It runs hozu check and fixes what it finds before it tells you it is done.',
                },
              ],
            },
          }),
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
                Unexpected: () => ui.p({ role: 'alert' }, ['The start commands are unavailable.']),
              },
            },
          ),
        ]),
        ui.use(Section, { props: { kicker: 'Who may see it' } }, [
          ui.use(Heading, {}, ['Your notes stay yours. Hozu checks.']),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
            'Every query and change over a visitor’s data says who may run it. Forget to say it, and the app does not type-check. Hozu refuses everyone else before your code runs, and checks that a list holds only the visitor’s own rows.',
          ]),
          ui.use(Steps, {
            class: 'mt-8',
            props: {
              items: [
                {
                  id: 'declare',
                  title: "access: 'signedIn'",
                  body: 'Or the row’s owner, or a condition such as an admin role. One line next to the query.',
                },
                {
                  id: 'refuse',
                  title: 'Forbidden',
                  body: 'Anyone else gets a refusal, and the page answers 403 or sends them to sign in.',
                },
                {
                  id: 'try',
                  title: 'Try it as Bob',
                  body: 'One hozu browse command signs in as Ada and Bob and opens Ada’s page as Bob.',
                },
              ],
            },
          }),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'data' }) } }, ['Who may run it →']),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'Data' } }, [
          ui.use(Heading, {}, ['Your API, called from where it belongs.']),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
            'Each query and mutation says what it needs, and Hozu decides where it runs. A public API is rendered on the server first, then called straight from the browser: no second hop, no double traffic. A token that lives in the browser never travels to your server, and an app without a server exports to GitHub Pages.',
          ]),
          ui.use(Steps, {
            class: 'mt-8',
            props: {
              items: [
                {
                  id: 'server',
                  title: "runs: 'server'",
                  body: 'A database, a secret or the session. The resolver in app.ts, as before.',
                },
                {
                  id: 'either',
                  title: "runs: 'either'",
                  body: 'A public API, or your own with CORS. In the HTML on first paint, then from the browser.',
                },
                {
                  id: 'browser',
                  title: "runs: 'browser'",
                  body: "The visitor's own token. Loading state on the server, the API call in the browser.",
                },
              ],
            },
          }),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'data' }) } }, ['Where data runs →']),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'Test as you build' } }, [
          ui.use(Heading, {}, ['Run your API next to the page.']),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
            'npm run dev puts an API drawer under every page: the data it reads, the changes it makes and your endpoints, with the requests each call really sent. The environment is declared once, secrets stay on the server, and the server can call your APIs on the inside.',
          ]),
          ui.div({ class: 'mt-8' }, [
            apiDemo(
              'The API drawer docked under a task board: a query ran through the server and its answer shows as a table, with the request the page sent listed below',
            ),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(devtools, null) } }, ['See the drawer →']),
            ui.use(
              Button,
              { variant: { intent: 'outline' }, props: { href: ui.link(doc, { slug: 'environment' }) } },
              ['Environment'],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'Scale' } }, [
          ui.use(Heading, {}, ['Five hundred features. Same page.']),
          ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
            'We generated apps of 50 and 500 features and fixed what grew with the app instead of the page. A page now loads only its own code and links, the check after an edit runs the type check alongside everything else, and several servers keep one another’s caches honest.',
          ]),
          ui.use(Steps, {
            class: 'mt-8',
            props: {
              items: [
                {
                  id: 'check',
                  title: '1.9 s check',
                  body: 'hozu check after a one-line edit at 500 features. It was 4.6 s.',
                },
                {
                  id: 'page',
                  title: 'Same page size',
                  body: 'A page carries the same data at 50 and at 500 features, and loads only its own code: 237 bytes here.',
                },
                {
                  id: 'servers',
                  title: 'Many servers',
                  body: 'A change on one server clears the others’ caches. Memory stays bounded.',
                },
              ],
            },
          }),
          ui.div({ class: 'mt-8 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'deploying' }) } }, ['Deploy several →']),
            ui.a(
              {
                href: 'https://github.com/olevatorr/Hozu/blob/main/docs/benchmarks/0003-scale.md',
                class: 'self-center underline',
              },
              ['How we measured'],
            ),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'DevTools' } }, [
          ui.use(Heading, {}, ['Point at it. Your agent gets the line.']),
          ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center' }, [
            selectDemo(
              'Hozu DevTools on a task board: the Add task button is selected and the inspector says it is shared by six places',
            ),
            ui.div({ class: 'grid content-start gap-4 text-lg' }, [
              ui.p({}, [
                'Run npm run dev, choose Select and click what is wrong. Say what should change, try a size, a colour or other words right on the page, and hand it over.',
              ]),
              ui.p({}, [
                'The request names the file, the line and the Hozu way to make the change: one button or every button, a message shared by two places, a state that needs a contract. Your agent stops searching and starts fixing.',
              ]),
              ui.p({}, [
                'And it points back: each part it changed gets a numbered frame on your page, with a note in your words.',
              ]),
              ui.div({ class: 'mt-2 flex flex-wrap gap-3' }, [
                ui.use(Button, { props: { href: ui.link(devtools, null) } }, ['Meet DevTools →']),
              ]),
            ]),
          ]),
        ]),
        ui.use(Section, { props: { kicker: 'For designers' } }, [
          ui.use(Heading, {}, ['Feels like Figma.']),
          ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center' }, [
            measureDemo(
              'The Add task button is selected and shows 136 × 40; holding Alt and pointing at nearby parts draws red lines with the distance in px',
            ),
            ui.div({ class: 'grid content-start gap-4 text-lg' }, [
              ui.p({}, [
                'DevTools uses the keys, the measuring and the words a designer already has: Shift+Enter goes up a level, Alt measures, the Design panel reads like Figma’s, with your tokens first.',
              ]),
              ui.p({}, [
                'Try a change on the page, then hand it to your agent. It writes the code; you never open a file.',
              ]),
              ui.div({ class: 'mt-2 flex flex-wrap gap-3' }, [
                ui.use(Button, { props: { href: ui.link(devtools, null) } }, ['See it in motion →']),
              ]),
            ]),
          ]),
          figmaCards('border-ink'),
        ]),
        ui.use(
          Section,
          {
            variant: { tone: 'ink' },
            props: { kicker: 'What it catches' },
          },
          [
            ui.use(Heading, {}, ['Mistakes that look fine and still break.']),
            ui.p({ class: 'mt-4 max-w-2xl' }, [
              'Each of these type-checks and builds. Hozu stops it anyway, and says what to do. Tap, hover or tab to a card to see the real diagnostic.',
            ]),
            ui.div(
              { class: 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4' },
              catches.map((c) =>
                ui.use(CatchCard, {
                  props: { code: c.code, name: c.name, story: c.story, message: c.message, fix: c.fix },
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
          props: { kicker: 'Components' },
        },
        [
          ui.use(Heading, {}, ['Declared UI. Checked class by class.']),
          ui.p({ class: 'mt-4 max-w-2xl' }, [
            'A button is a declaration in a kit, not a helper that disappears. Pick a variant: the preview, its source and what hozu render prints all come from the same component. This site is built from the same kit.',
          ]),
          ui.div({ class: 'mt-6 flex gap-3', role: 'group', 'aria-label': 'Button variant' }, [
            ui.button(
              {
                type: 'button',
                class: choice,
                'aria-pressed': ctx.intent === 'solid',
                on: { click: ui.send(Pick, { intent: 'solid' }) },
              },
              ['intent: solid'],
            ),
            ui.button(
              {
                type: 'button',
                class: choice,
                'aria-pressed': ctx.intent === 'outline',
                on: { click: ui.send(Pick, { intent: 'outline' }) },
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
                          'Start building',
                        ])
                      : ui.use(Button, { variant: { intent: 'outline' }, props: { href: '#' } }, [
                          'Start building',
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
              failed: { Unexpected: () => ui.p({ role: 'alert' }, ['The playground is unavailable.']) },
            },
          ),
          ui.p({ class: 'mt-6 max-w-2xl text-sm' }, [
            'Two classes that set one property on one element are reported as HZ079, so an override never wins by accident. ',
            ui.a({ href: ui.link(doc, { slug: 'views' }), class: 'underline decoration-red' }, [
              'Read about components',
            ]),
          ]),
          ui.h3({ class: 'mt-16 text-2xl font-black uppercase' }, [
            'The 3D joint at the top is a component too.',
          ]),
          ui.p({ class: 'mt-3 max-w-2xl' }, [
            'A Blender script builds the model, three.js renders it in a client component, and the same machine that runs the demo tells it when to split. Without JavaScript it is a still image.',
          ]),
          ui.query(
            getPlayground,
            {},
            {
              ready: (play) =>
                ui.div({ class: 'prose prose-invert mt-6 max-w-none prose-figcaption:text-paper' }, [
                  ui.use(CodeBlock, {}, [ui.html(play.joint)]),
                ]),
              pending: null,
              failed: { Unexpected: () => ui.p({ role: 'alert' }, ['The source is unavailable.']) },
            },
          ),
        ],
      ),
      ui.use(Section, { props: { kicker: 'Under the hood' } }, [
        ui.use(Heading, {}, ['feature() → IR → validator → compiler → runtime']),
        ui.p({ class: 'mt-4 max-w-3xl text-lg' }, [
          'Every page is planned from what its data declares: who may see it and how fresh it must be. Only nodes bound to a machine ship JavaScript; everything else on this page is plain HTML.',
        ]),
        ui.div({ class: 'mt-6' }, [
          ui.use(Button, { props: { href: ui.link(how, null) } }, ['Open the lab →']),
        ]),
        ui.query(
          listChapters,
          {},
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
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Chapters are unavailable.']) },
          },
        ),
      ]),
      ui.div({}, [
        ui.use(Section, { props: { kicker: 'The trials' } }, [
          ui.use(Heading, {}, ['Measured, with the rough edges included.']),
          ui.p({ class: 'mt-4 max-w-3xl' }, [
            'Trial 0024: the same notes app built and changed 28 times, with Hozu learned from the guide, with it already known, and with Nuxt. The last eight changes were written by a session that never saw Hozu. Held out: ',
            claimLink('cold', `${claim('cold').value} Nuxt’s tokens`),
            ' learning, ',
            claimLink('known', `${claim('known').value} once known`),
            ' (two runs each).',
          ]),
          ui.use(StatTable, {
            class: 'mt-6',
            props: {
              caption: 'Trial 0024: 29 steps, the same model and the same hidden checks',
              before: 'Hozu 0.14',
              after: 'Nuxt 4.5.2',
              rows: [
                { id: 'p', label: 'Changes with every check passing', before: '29', after: '26' },
                { id: 's', label: 'Silent failures (build green, feature broken)', before: '0', after: '3' },
                {
                  id: 'c',
                  label: 'Tokens per unseen change, against Nuxt',
                  before: claim('cold').value,
                  after: 'baseline',
                },
                {
                  id: 'k',
                  label: 'The same, once Hozu is known',
                  before: claim('known').value,
                  after: 'baseline',
                },
              ],
            },
          }),
          ui.p({ class: 'mt-10 max-w-3xl' }, [
            'Before that, trial 0021 (Hozu 0.8). Cost: ',
            claimLink('tokens', `${claim('tokens').value} Nuxt’s tokens per change`),
            ' (steps 13–20, one run per framework), against ',
            claimLink('oldCost', `${claim('oldCost').value} on Hozu 0.7`),
            '. Outcome: ',
            claimLink('regressions', `${claim('regressions').value} regressions`),
            ' and ',
            claimLink('silent', `${claim('silent').value} silent failures`),
            ' over 16 changes, against ',
            claimLink('old', `${claim('old').value} regression failures`),
            ' and silent failures at ',
            claimLink('oldSilent', `${claim('oldSilent').value} steps`),
            ' on Hozu 0.7. Not met: the cost ratio still rises slightly over the run.',
          ]),
          ui.use(StatTable, {
            class: 'mt-6',
            props: {
              caption: 'Trial 0021: the same notes app, changed 16 more times by an agent',
              before: 'Hozu 0.7',
              after: 'Hozu 0.8',
              rows: [
                {
                  id: 'r',
                  label: 'Regression failures',
                  before: claim('old').value,
                  after: claim('regressions').value,
                },
                {
                  id: 's',
                  label: 'Steps with silent failures',
                  before: claim('oldSilent').value,
                  after: claim('silent').value,
                },
                {
                  id: 'c',
                  label: 'Cost against Nuxt (geometric mean)',
                  before: claim('oldCost').value,
                  after: claim('tokens').value,
                },
              ],
            },
          }),
          curve('0021-0-8-long-run', 'Trial 0021 per-step cost, lines and checks for Hozu 0.8 and Nuxt'),
          ui.p({ class: 'mt-2 font-mono text-xs' }, [
            'Raw records; Nuxt step 14 is undercounted there, and the report explains the correction. ',
            ui.a({ href: ui.link(trial, { slug: claim('tokens').trial }), class: 'underline' }, [
              'Read trial 0021',
            ]),
            ' · ',
            ui.a({ href: ui.link(trial, { slug: claim('cold').trial }), class: 'underline' }, [
              'Read trial 0024',
            ]),
            ' · ',
            ui.a({ href: ui.link(trials, null), class: 'underline' }, ['All trials']),
          ]),
        ]),
        ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: 'Start' } }, [
          ui.div({ class: 'flex items-end justify-between gap-6' }, [
            ui.use(Heading, {}, ['Build something. Then try to break it.']),
            peg('hello', 120, 'hidden h-auto shrink-0 sm:block', true),
          ]),
          ui.div({ class: 'mt-8 flex flex-wrap gap-4' }, [
            ui.use(
              Button,
              { variant: { intent: 'light' }, props: { href: ui.link(doc, { slug: 'getting-started' }) } },
              ['Start building →'],
            ),
            ui.use(
              Button,
              { variant: { intent: 'lightOutline' }, props: { href: 'https://github.com/olevatorr/Hozu' } },
              ['GitHub'],
            ),
            ui.use(Button, { variant: { intent: 'lightOutline' }, props: { href: support } }, [
              'Buy Peg a coffee',
            ]),
          ]),
        ]),
        ui.use(Ticker, {
          slots: {
            source: ui.a({ href: ui.link(trial, { slug: claim('cold').trial }), class: 'underline' }, [
              'Sources',
            ]),
          },
          props: {
            items: [
              `${claim('passed').value} changes passed every check`,
              `${claim('known').value} Nuxt’s tokens once known`,
              `${claim('js').value} client JS`,
              'every change checked',
            ],
          },
        }),
      ]),
    ]),
})
