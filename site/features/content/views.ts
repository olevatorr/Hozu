import { feature, ui } from '@hozu/core'
import { doc, home, how, trial, trials } from '../../routes.ts'
import { Chapter, Docs } from './articles.ts'
import { Footer, Header } from './chrome.ts'
import { CodeCopy } from './components.ts'
import {
  getChangelog,
  getChapter,
  getDoc,
  getStart,
  getTrial,
  listChapters,
  listDocs,
  listTrials,
} from './model.ts'

export { Chapter, Docs, Footer, Header }

const catches: {
  ask: string
  mistake: string
  conventional: [boolean, string][]
  diagnostic: string
  provenance: string
}[] = [
  {
    ask: '“Make notes private per user.”',
    mistake: "The agent keeps the notes list cached and keys it by the signed-in user's name.",
    conventional: [
      [true, 'TypeScript passes'],
      [true, 'The build passes'],
      [false, 'A cache keyed by the URL serves one user’s notes to the next'],
    ],
    diagnostic: `features/notes/views.ts:9:14  error  HZ022
Public query notes.notesOf is keyed by user-scoped data
cause: Its result is cached in the shared public partition (revalidate), so user-derived input would reach a cacheable region.
fix: Make the query scope: 'user', or key it by data that does not come from the user`,
    provenance:
      'Conventional column: an illustration of the failure. Hozu column: hozu check on this mistake.',
  },
  {
    ask: '“Add pinned notes, listed first.”',
    mistake: 'The agent sorts and updates the fetched list in place.',
    conventional: [
      [true, 'TypeScript passes'],
      [true, 'The build passes; the agent reports success'],
      [false, 'New notes stop appearing and deleted notes stay listed'],
    ],
    diagnostic: `features/notes/views.ts:9:14  error  HZ014
Method "sort" cannot run on a reference: references are recorded, not evaluated. For a list use ui.each(list, 'id', (item) => …); for any other computation declare a fn() and call it with the reference.`,
    provenance:
      'Conventional column: observed in trial 0012 (Nuxt run 1, a shallow ref mutated in place). Hozu column: hozu check on the same idea.',
  },
  {
    ask: '“Stop saving empty notes.”',
    mistake:
      'The agent tightens the rule to three characters, so a two-character note that saved yesterday no longer does.',
    conventional: [
      [true, 'TypeScript passes'],
      [true, 'The build passes'],
      [false, 'Behaviour changed; nothing flags it unless a test happens to cover it'],
    ],
    diagnostic: `features/notes/views.ts:18:31  error  HZ015
Contract savesLongDraft: Context differs from the expectation
cause: context.saved: expected true, got false. No transition fired.
fix: Decide which is intended: fix the machine, or update the contract to specify the new behavior`,
    provenance:
      'Conventional column: an illustration. Hozu column: hozu check after the guard changed and its contract did not.',
  },
]

export const Home = ui.view({
  render: () =>
    ui.main({ id: 'main' }, [
      ui.section({ 'data-hero': '' }, [
        ui.div({}, [
          ui.h1({}, ['Built for agents that change software.']),
          ui.p({ 'data-pitch': '' }, [
            'Invalid programs are hard to express. Valid programs are cheap to verify.',
          ]),
          ui.p({}, [
            'Hozu is a web framework for coding agents. When a change looks right and still type-checks, Hozu reports what broke, where, and how to fix it.',
          ]),
          ui.a({ href: ui.link(doc, { slug: 'getting-started' }), 'data-button': '' }, ['Start building']),
          ui.a({ href: ui.link(how, null), 'data-secondary': '' }, ['Understand Hozu']),
        ]),
        ui.div({ 'data-joint': '' }, [
          ui.img({
            src: ui.asset(new URL('../../assets/logo.png', import.meta.url)),
            width: 256,
            height: 256,
            alt: 'The Hozu interlocking joint logo',
          }),
          ui.p({}, ['ほぞ / A joint that fits.']),
        ]),
      ]),
      ui.section({ 'data-section': '', 'aria-labelledby': 'catches-title' }, [
        ui.h2({ id: 'catches-title' }, ['What an agent gets wrong, and what Hozu says.']),
        ui.p({ 'data-lede': '' }, [
          'Each of these changes type-checks and builds. The diagnostics are the real output of hozu check on the same mistake, wrapped to fit.',
        ]),
        ui.div({ 'data-catches': '' }, [
          ...catches.map((c) =>
            ui.article({}, [
              ui.h3({}, [c.ask]),
              ui.p({}, [c.mistake]),
              ui.div({ 'data-versus': '' }, [
                ui.div({}, [
                  ui.h4({}, ['A conventional stack']),
                  ui.ul({}, [
                    ...c.conventional.map(([ok, text]) =>
                      ui.li({ 'data-ok': ok ? 'yes' : 'no' }, [`${ok ? '✓' : '✗'} ${text}`]),
                    ),
                  ]),
                ]),
                ui.div({}, [ui.h4({}, ['hozu check']), ui.pre({}, [ui.code({}, [c.diagnostic])])]),
              ]),
              ui.p({ 'data-provenance': '' }, [c.provenance]),
            ]),
          ),
        ]),
      ]),
      ui.section({ 'data-start': '', 'aria-labelledby': 'start-title' }, [
        ui.div({}, [
          ui.h2({ id: 'start-title' }, ['Your first 30 seconds']),
          ui.p({}, ['Create an app, add a feature, check your work. Node 22.18 or newer.']),
          ui.p({}, ['Use --agent agents for Codex, Cursor or Copilot; --agent claude for Claude Code.']),
        ]),
        ui.query(
          getStart,
          {},
          {
            ready: (start) => ui.use(CodeCopy, { props: {}, on: {} }, [ui.html(start.html)]),
            pending: null,
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Quick start is unavailable.']) },
          },
        ),
      ]),
      ui.section({ 'aria-labelledby': 'principles-title', 'data-section': '' }, [
        ui.h2({ id: 'principles-title' }, ['Structure you can verify.']),
        ui.div({ 'data-principles': '' }, [
          ...[
            [
              'The IR is the source of truth',
              'Typed builders describe your app as data. The validator, compiler and runtime share one representation.',
            ],
            [
              'Contracts for every behaviour',
              'Given a state, when an event happens, expect a result. Every machine transition has a contract.',
            ],
            [
              'Rendering is derived',
              'Declare who can see data and how fresh it must be. Hozu derives the render plan; only machine-bound views hydrate.',
            ],
            [
              'Diagnostics that lead to a fix',
              'Each diagnostic carries a location, a cause and a suggested fix. Read it yourself or pass the JSON to your agent.',
            ],
          ].map(([title, body]) => ui.article({}, [ui.h3({}, [title!]), ui.p({}, [body!])])),
        ]),
      ]),
      ui.nav({ 'data-reading-path': '', 'aria-label': 'Learn Hozu' }, [
        ui.a({ href: ui.link(doc, { slug: 'getting-started' }) }, [
          ui.strong({}, ['Build something']),
          ui.span({}, ['Start with the docs']),
        ]),
        ui.a({ href: ui.link(how, null) }, [
          ui.strong({}, ['Understand the design']),
          ui.span({}, ['Explore how it works']),
        ]),
        ui.a({ href: ui.link(trials, null) }, [
          ui.strong({}, ['Examine the evidence']),
          ui.span({}, ['Read the trials']),
        ]),
      ]),
      ui.p({ 'data-boundaries': '' }, [
        'Hozu is not a separate SPA mode or a place for arbitrary effects in views. It makes behaviour explicit, and asks you to pay for that structure.',
      ]),
      ui.section({ 'data-results': '', 'aria-labelledby': 'results-title' }, [
        ui.h2({ id: 'results-title' }, ['Measured, with the rough edges included.']),
        ui.p({}, [
          'Two tasks, each built from a spec and then changed by an agent, checked by hidden acceptance tests. Notes: accounts, per-user isolation, double submit, forms without JavaScript, HttpOnly sessions. City bikes: a Leaflet map, a Chart.js chart, GSAP animation and a Three.js globe. Every run is also re-checked after the change for regressions.',
        ]),
        ui.table({}, [
          ui.caption({}, [
            'Trials 0012, 0017 and 0019: the same tasks, prompts and model; agent cost relative to Nuxt',
          ]),
          ui.thead({}, [
            ui.tr({}, [
              ui.th({ scope: 'col' }, ['']),
              ui.th({ scope: 'col' }, ['Hozu 0.7']),
              ui.th({ scope: 'col' }, ['Nuxt']),
            ]),
          ]),
          ui.tbody({}, [
            ...[
              ['Checks passed', 'Every run, trials 0016–0019', 'Notes 67 / 72, city bikes 76 / 76'],
              ['Notes: build', '1.14×', '1×'],
              ['Notes: change', '1.38×', '1×'],
              ['City bikes: build', '1.75×', '1×'],
              ['City bikes: change', '2.03×', '1×'],
            ].map(([row, hozu, nuxt]) =>
              ui.tr({}, [ui.th({ scope: 'row' }, [row!]), ui.td({}, [hozu!]), ui.td({}, [nuxt!])]),
            ),
          ]),
        ]),
        ui.p({}, [
          'One Nuxt change silently broke three working features; no Hozu run did. The price is extra tokens: a guide the model has not seen, and on widget-heavy apps more code to write. Two to four runs per step: small samples, not failure rates.',
        ]),
        ui.ul({}, [
          ...[
            ['0019-0-7-write-less', '0019: 0.7 on both tasks'],
            ['0018-widgets-0-6', '0018: city bikes on 0.6, with hozu browse'],
            ['0017-widgets', '0017: city bikes, the Nuxt baseline'],
            ['0016-0-5-four-runs', '0016: notes on 0.5, four runs per step and a Codex run'],
            ['0012-correctness-notes', '0012: notes, correctness, methods and limitations'],
          ].map(([slug, title]) => ui.li({}, [ui.a({ href: ui.link(trial, { slug: slug! }) }, [title!])])),
        ]),
      ]),
    ]),
})
export const Trials = ui.view({
  render: () =>
    ui.main({ id: 'main', 'data-reading': '' }, [
      ui.h1({}, ['Trials, not promises.']),
      ui.p({}, [
        'The original experiments: what worked, what failed, and what it cost. These pages render directly from docs/trials in the repository. Historical records retain the name Tenon.',
      ]),
      ui.query(
        listTrials,
        {},
        {
          ready: (items) =>
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
          pending: null,
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Trials are unavailable.']) },
        },
      ),
    ]),
})
export const Trial = ui.view({
  route: trial,
  render: ({ params }) =>
    ui.main({ id: 'main', 'data-reading': '' }, [
      ui.a({ href: ui.link(trials, null) }, ['All trials']),
      ui.query(
        getTrial,
        { slug: params.slug },
        {
          ready: (article) =>
            ui.article({ class: 'prose max-w-none' }, [
              article.hasCode
                ? ui.use(CodeCopy, { props: {}, on: {} }, [ui.html(article.html)])
                : ui.html(article.html),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.h1({}, ['Page not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Trial is unavailable.']),
          },
        },
      ),
    ]),
})
export const Changelog = ui.view({
  render: () =>
    ui.main({ id: 'main', 'data-reading': '' }, [
      ui.query(
        getChangelog,
        {},
        {
          ready: (article) =>
            ui.article({ class: 'prose max-w-none' }, [
              article.hasCode
                ? ui.use(CodeCopy, { props: {}, on: {} }, [ui.html(article.html)])
                : ui.html(article.html),
            ]),
          pending: null,
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Changelog is unavailable.']) },
        },
      ),
    ]),
})
export const NotFound = ui.view({
  render: () =>
    ui.main({ id: 'main', 'data-reading': '' }, [
      ui.h1({}, ['Page not found']),
      ui.p({}, ['This page does not exist. Start with the documentation or return home.']),
      ui.a({ href: ui.link(home, null), 'data-button': '' }, ['Return home']),
    ]),
})
export const content = feature({
  id: 'content',
  exports: [listChapters],
  intent: { summary: 'Static official Hozu documentation, trials and releases' },
  declarations: [
    {
      CodeCopy,
      listChapters,
      getChapter,
      getStart,
      Chapter,
      listDocs,
      getDoc,
      listTrials,
      getTrial,
      getChangelog,
      Header,
      Footer,
      Home,
      Docs,
      Trials,
      Trial,
      Changelog,
      NotFound,
    },
  ],
})
