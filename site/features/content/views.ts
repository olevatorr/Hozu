import { feature, ui } from '@hozu/core'
import { doc, home, how, trial, trials } from '../../routes.ts'
import { Chapter, Docs } from './articles.ts'
import { Footer, Header } from './chrome.ts'
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

export const Home = ui.view({
  render: () =>
    ui.main({ id: 'main' }, [
      ui.section({ 'data-hero': '' }, [
        ui.div({}, [
          ui.h1({}, ['An AI-first web framework.']),
          ui.p({ 'data-pitch': '' }, [
            'Invalid programs are hard to express. Valid programs are cheap to verify.',
          ]),
          ui.p({}, [
            'Give your coding agent a structure it can check: typed views, explicit data and contracts for every behaviour.',
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
            ready: (start) => ui.div({}, [ui.html(start.html)]),
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
          'In the notes-app correctness trial, Hozu passed 72/72 checks and Nuxt passed 67/72 across two runs per framework. One Nuxt change broke existing behaviour. This is a small sample, not an estimated failure rate.',
        ]),
        ui.table({}, [
          ui.caption({}, ['Trial 0012: build, change and regression checks']),
          ui.thead({}, [
            ui.tr({}, [ui.th({ scope: 'col' }, ['Framework']), ui.th({ scope: 'col' }, ['Checks passed'])]),
          ]),
          ui.tbody({}, [
            ui.tr({}, [ui.th({ scope: 'row' }, ['Hozu']), ui.td({}, ['72 / 72'])]),
            ui.tr({}, [ui.th({ scope: 'row' }, ['Nuxt']), ui.td({}, ['67 / 72'])]),
          ]),
        ]),
        ui.p({}, [
          'The trade-off: trial 0012 used 2.79× Nuxt’s weighted tokens to build and 2.06× to change. With the account scaffold, trial 0013 reduced build cost to 1.66×, reusing the earlier Nuxt baseline.',
        ]),
        ui.ul({}, [
          ...[
            ['0010-map-scaffold-recipes', '0010: task-board build 1.64×, change 1.44×'],
            ['0011-inspect-and-summaries', '0011: task-board build 2.28×, change 1.53×'],
            ['0012-correctness-notes', '0012: correctness, methods and limitations'],
            ['0013-notes-with-auth-scaffold', '0013: the account scaffold follow-up'],
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
          ready: (article) => ui.article({ class: 'prose max-w-none' }, [ui.html(article.html)]),
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
          ready: (article) => ui.article({ class: 'prose max-w-none' }, [ui.html(article.html)]),
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
  declarations: {
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
})
