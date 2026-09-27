import { feature, op, ui } from '@hozu/core'
import { changelog, doc, home, trial, trials } from '../../routes.ts'
import { getChangelog, getDoc, getTrial, listDocs, listTrials } from './model.ts'

export const Header = ui.view({
  render: () =>
    ui.header({}, [
      ui.a({ href: '#main', 'data-skip': '' }, ['Skip to content']),
      ui.nav({ 'aria-label': 'Main navigation', 'data-header': '' }, [
        ui.a({ href: ui.link(home, null), 'data-brand': '', 'aria-label': 'Hozu home' }, [
          ui.img({
            src: ui.asset(new URL('../../assets/logo.png', import.meta.url)),
            width: 48,
            height: 48,
            alt: '',
          }),
          'Hozu',
        ]),
        ui.div({ 'data-nav': '' }, [
          ui.a({ href: ui.link(doc, { slug: 'getting-started' }) }, ['Docs']),
          ui.a({ href: ui.link(trials, null) }, ['Trials']),
          ui.a({ href: ui.link(changelog, null) }, ['Changelog']),
          ui.a({ href: 'https://github.com/olevatorr/Hozu' }, ['GitHub']),
          ui.a({ href: 'https://www.npmjs.com/package/@hozu/cli' }, ['npm']),
        ]),
      ]),
    ]),
})
export const Footer = ui.view({
  render: () =>
    ui.footer({}, [
      ui.p({}, ['Hozu (ほぞ). A precise fit between intent and implementation.']),
      ui.p({}, ['Built with Hozu. Static HTML, all the way down.']),
      ui.a({ href: 'https://github.com/olevatorr/Hozu/blob/main/LICENSE' }, ['MIT license']),
    ]),
})
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
          ui.a({ href: ui.link(doc, { slug: 'concepts' }), 'data-secondary': '' }, ['Understand Hozu']),
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
        ui.pre({}, [
          ui.code({}, [
            'npm create hozu@latest my-app -- --agent claude\ncd my-app\nnpm install\nnpx hozu add feature tasks --page /tasks\nnpx hozu check',
          ]),
        ]),
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
export const Docs = ui.view({
  route: doc,
  render: ({ params }) =>
    ui.main({ id: 'main', 'data-doc-layout': '' }, [
      ui.aside({}, [
        ui.nav({ 'aria-label': 'Documentation' }, [
          ui.query(
            listDocs,
            {},
            {
              ready: (items) =>
                ui.ul({}, [
                  ui.each(items, 'slug', (item) =>
                    ui.li({}, [
                      ui.a(
                        {
                          href: ui.link(doc, { slug: item.slug }),
                          'aria-current': op.eq(params.slug, item.slug),
                        },
                        [item.title],
                      ),
                    ]),
                  ),
                ]),
              pending: null,
              failed: {
                Unexpected: () => ui.p({ role: 'alert' }, ['Documentation navigation is unavailable.']),
              },
            },
          ),
        ]),
      ]),
      ui.query(
        getDoc,
        { slug: params.slug },
        {
          ready: (article) =>
            ui.article({ class: 'prose max-w-none' }, [
              ui.h1({}, [article.title]),
              ui.p({ 'data-description': '' }, [article.description]),
              ui.html(article.html),
              ui.nav({ 'aria-label': 'Previous and next documentation', 'data-pagination': '' }, [
                ui.each(article.previous, 'slug', (item) =>
                  ui.a({ href: ui.link(doc, { slug: item.slug }) }, ['Previous: ', item.title]),
                ),
                ui.each(article.next, 'slug', (item) =>
                  ui.a({ href: ui.link(doc, { slug: item.slug }) }, ['Next: ', item.title]),
                ),
              ]),
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.h1({}, ['Page not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Documentation is unavailable.']),
          },
        },
      ),
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
  intent: { summary: 'Static official Hozu documentation, trials and releases' },
  declarations: {
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
