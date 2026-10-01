import { feature, ui } from '@hozu/core'
import { doc, home, trial, trials } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { CatchCard } from '../../site/catch-card.ts'
import { CodeBlock } from '../../site/code-block.ts'
import { Heading } from '../../site/display.ts'
import { Prose } from '../../site/prose.ts'
import { Receipt, ReceiptLine } from '../../site/receipt.ts'
import { Section } from '../../site/section.ts'
import { StatTable } from '../../site/stat-table.ts'
import { Steps } from '../../site/steps.ts'
import { Ticker } from '../../site/ticker.ts'
import { Chapter, Docs } from './articles.ts'
import { articleBody } from './body.ts'
import { Footer, Header } from './chrome.ts'
import { catches, claim } from './claims.ts'
import {
  getChangelog,
  getChapter,
  getDoc,
  getRelease,
  getStart,
  getTrial,
  listChapters,
  listDocs,
  listTrials,
} from './model.ts'

export { Chapter, Docs, Footer, Header }

const receiptLines = (ids: string[]) =>
  ui.div(
    {},
    ids.map((id) =>
      ui.use(ReceiptLine, {
        props: {
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
export const Home = ui.view({
  render: () =>
    ui.div({}, [
      ui.use(Section, { variant: { depth: 1 }, props: { label: 'For everyone', kicker: '02 · The bill' } }, [
        ui.use(Heading, {}, ['Yes, it costs more. Here is the receipt.']),
        ui.div({ class: 'mt-8 grid gap-10 lg:grid-cols-[28rem_minmax(0,1fr)]' }, [
          ui.use(Receipt, {
            slots: {
              pay: receiptLines(['tokens', 'calls']),
              get: receiptLines(['regressions', 'silent', 'js']),
            },
          }),
          ui.div({ class: 'grid content-start gap-4 text-lg' }, [
            ui.p({}, [
              'Yes, Hozu eats more tokens. About 1.3–1.7× what Nuxt does for the same change. Your agent reads our guide every session, runs the checker, and fixes what it finds before it says “done”. That’s the bill.',
            ]),
            ui.p({}, [
              'What it buys: in 16 changes, nothing that worked stopped working. Cheaper frameworks let your agent ship the bug and send you the invoice later. In ',
              ui.a(
                {
                  href: ui.link(trial, { slug: claim('nuxt').trial }),
                  class: 'font-bold underline decoration-red',
                },
                ['one trial'],
              ),
              ', a single Nuxt change quietly broke three working features. We are not immune either: ',
              ui.a(
                {
                  href: ui.link(trial, { slug: claim('old').trial }),
                  class: 'font-bold underline decoration-red',
                },
                ['Hozu 0.7 missed 8 regressions'],
              ),
              ' on a long run, and 0.8 was built to close exactly those gaps.',
            ]),
          ]),
        ]),
      ]),
      ui.use(
        Section,
        { variant: { depth: 2 }, props: { label: 'Vibe coders', kicker: '03 · How you work' } },
        [
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
                  body: '“Add sharing to my notes.” It reads the guide that came with the app.',
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
                ui.div({ class: 'prose mt-8 max-w-none prose-pre:bg-ink prose-pre:text-paper' }, [
                  ui.use(CodeBlock, {}, [ui.html(start.html)]),
                ]),
              pending: null,
              failed: { Unexpected: () => ui.p({ role: 'alert' }, ['The start commands are unavailable.']) },
            },
          ),
        ],
      ),
      ui.use(
        Section,
        {
          variant: { tone: 'ink', depth: 3 },
          props: { label: 'Curious builders', kicker: '04 · What it catches' },
        },
        [
          ui.use(Heading, {}, ['Mistakes that look fine and still break.']),
          ui.p({ class: 'mt-4 max-w-2xl' }, [
            'Each of these type-checks and builds. Hozu stops it anyway, and says what to do. Hover or tab to a card to see the real diagnostic.',
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
})
export const Evidence = ui.view({
  render: () =>
    ui.div({}, [
      ui.use(Section, { variant: { depth: 5 }, props: { label: 'Skeptics', kicker: '07 · The trials' } }, [
        ui.use(Heading, {}, ['Measured, with the rough edges included.']),
        ui.p({ class: 'mt-4 max-w-3xl' }, [
          'Cost: 1.34–1.72× Nuxt’s tokens per change (trial 0021, steps 13–20, one run per framework). Outcome: 0 regressions and 0 silent failures over 16 changes, against 8 regression failures on Hozu 0.7. Not met: the cost ratio still rises slightly over the run.',
        ]),
        ui.use(StatTable, {
          class: 'mt-6',
          props: {
            caption: 'The same notes app, changed 16 more times by an agent',
            rows: [
              { id: 'r', label: 'Regression failures', before: '8', after: '0' },
              { id: 's', label: 'Steps with silent failures', before: '5', after: '0' },
              {
                id: 'c',
                label: 'Cost against Nuxt (geometric mean)',
                before: '2.64–2.73×',
                after: '1.34–1.72×',
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
          ui.a({ href: ui.link(trials, null), class: 'underline' }, ['All trials']),
        ]),
      ]),
      ui.use(
        Section,
        { variant: { tone: 'ink', depth: 1 }, props: { label: 'Everyone', kicker: '08 · Start' } },
        [
          ui.use(Heading, {}, ['Build something. Then try to break it.']),
          ui.div({ class: 'mt-8 flex flex-wrap gap-4' }, [
            ui.use(
              Button,
              { variant: { intent: 'solid' }, props: { href: ui.link(doc, { slug: 'getting-started' }) } },
              ['Start building →'],
            ),
            ui.a(
              {
                href: 'https://github.com/olevatorr/Hozu',
                class: 'inline-block border-4 border-paper px-4 py-3 text-sm font-extrabold uppercase',
              },
              ['GitHub'],
            ),
          ]),
        ],
      ),
      ui.use(Ticker, {
        props: {
          items: [
            `${claim('regressions').value} regressions in 16 changes`,
            `${claim('tokens').value} the tokens of Nuxt`,
            `${claim('js').value} client JS`,
            'every change checked',
          ],
        },
      }),
    ]),
})
export const Trials = ui.view({
  render: () =>
    ui.use(Prose, { variant: { width: 'single' } }, [
      ui.h1({}, ['Trials, not promises.']),
      ui.p({ class: 'text-xl' }, [
        'The original experiments: what worked, what failed, and what it cost. These pages render directly from docs/trials in the repository. Historical records retain the name Tenon.',
      ]),
      ui.query(
        listTrials,
        {},
        {
          ready: (items) =>
            ui.div({ class: 'overflow-x-auto' }, [
              ui.table({}, [
                ui.caption({}, ['All trials, newest first']),
                ui.thead({}, [
                  ui.tr({}, [ui.th({ scope: 'col' }, ['Trial']), ui.th({ scope: 'col' }, ['Source'])]),
                ]),
                ui.tbody({}, [
                  ui.each(items, 'slug', (item) =>
                    ui.tr({}, [
                      ui.td({}, [ui.a({ href: ui.link(trial, { slug: item.slug }) }, [item.title])]),
                      ui.td({}, ['Repository record']),
                    ]),
                  ),
                ]),
              ]),
            ]),
          pending: null,
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Trials are unavailable.']) },
        },
      ),
    ]),
})
export const Trial = ui.view({
  route: trial,
  render: ({ params }) =>
    ui.query(
      getTrial,
      { slug: params.slug },
      {
        ready: (article) =>
          ui.use(Prose, { variant: { width: 'single' } }, [
            ui.a(
              { href: ui.link(trials, null), class: 'font-mono text-xs font-bold text-red no-underline' },
              ['All trials'],
            ),
            articleBody(article),
          ]),
        pending: null,
        failed: {
          NotFound: () => ui.use(Prose, { variant: { width: 'single' } }, [ui.h1({}, ['Page not found'])]),
          Unexpected: () => ui.p({ role: 'alert' }, ['Trial is unavailable.']),
        },
      },
    ),
})
export const Changelog = ui.view({
  render: () =>
    ui.query(
      getChangelog,
      {},
      {
        ready: (article) => ui.use(Prose, { variant: { width: 'single' } }, [articleBody(article)]),
        pending: null,
        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Changelog is unavailable.']) },
      },
    ),
})
export const NotFound = ui.view({
  render: () =>
    ui.use(Prose, { variant: { width: 'single' } }, [
      ui.h1({}, ['Page not found']),
      ui.p({}, ['This page does not exist. Start with the documentation or return home.']),
      ui.a({ href: ui.link(home, null) }, ['Return home']),
    ]),
})
export const content = feature({
  id: 'content',
  exports: [listChapters],
  intent: { summary: 'Static official Hozu documentation, trials and releases' },
  declarations: [
    {
      listChapters,
      getChapter,
      getStart,
      Chapter,
      listDocs,
      getDoc,
      listTrials,
      getTrial,
      getChangelog,
      getRelease,
      Header,
      Footer,
      Home,
      Evidence,
      Docs,
      Trials,
      Trial,
      Changelog,
      NotFound,
    },
  ],
})
