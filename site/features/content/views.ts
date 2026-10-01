import { feature, ui } from '@hozu/core'
import { home, trial, trials } from '../../routes.ts'
import { Prose } from '../../site/prose.ts'
import { Chapter, Docs } from './articles.ts'
import { articleBody } from './body.ts'
import { Footer, Header } from './chrome.ts'
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
              { href: ui.link(trials, null), class: 'font-mono text-xs font-bold text-ember no-underline' },
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
  exports: [listChapters, getStart],
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
      Docs,
      Trials,
      Trial,
      Changelog,
      NotFound,
    },
  ],
})
