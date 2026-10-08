import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { getChapter, getDoc, getTrial, listChapters, listDocs, listTrials } from './features/content/model.ts'
import {
  Changelog,
  Chapter,
  content,
  Docs,
  Footer,
  Header,
  NotFound,
  Trial,
  Trials,
} from './features/content/views.ts'
import { DevToolsPage } from './features/home/devtools.ts'
import { homePage } from './features/home/feature.ts'
import { homeText } from './features/home/messages.ts'
import { Home } from './features/home/views.ts'
import { labText } from './features/lab/messages.ts'
import { How, lab } from './features/lab/views.ts'
import { changelog, chapter, devtools, doc, home, how, notFound, trial, trials } from './routes.ts'
import { kit } from './site/kit.ts'

const icon = ui.asset(new URL('./assets/icon-256.png', import.meta.url))
const share = ui.asset(new URL('./assets/og-home.png', import.meta.url))
export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  previews: new URL('./previews.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  site: {
    url: 'https://hozu.org',
    name: 'Hozu',
    lang: 'en',
    locales: ['en', 'zh-TW'],
    icon,
    themeColor: '#f1ede4',
  },
  notFound,
  routes: { home, doc, trials, trial, changelog, notFound, how, chapter, devtools },
  pages: [
    ui.page(how, {
      views: [Header, How, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: labText.headTitle,
          description: labText.headDescription,
          image: share,
        }),
      },
    }),
    ui.page(chapter, {
      views: [Header, Chapter, Footer],
      assert: 'static',
      head: {
        query: getChapter,
        input: (params, locale) => ({ slug: params.slug, locale }),
        failed: { NotFound: 404 },
        render: (article) => ({ title: article.title, description: article.description, image: share }),
      },
      entries: { query: listChapters, input: { locale: 'en' }, params: (item) => ({ slug: item.slug }) },
    }),
    ui.page(home, {
      views: [Header, Home, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: homeText.headTitle,
          description: homeText.headDescription,
          image: share,
        }),
      },
    }),
    ui.page(doc, {
      views: [Header, Docs, Footer],
      assert: 'static',
      head: {
        query: getDoc,
        input: (params, locale) => ({ slug: params.slug, locale }),
        failed: { NotFound: 404 },
        render: (article) => ({ title: article.title, description: article.description, image: share }),
      },
      entries: { query: listDocs, input: { locale: 'en' }, params: (item) => ({ slug: item.slug }) },
    }),
    ui.page(devtools, {
      views: [Header, DevToolsPage, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: 'Hozu DevTools',
          description: homeText.dtHeadDescription,
          image: ui.asset(new URL('./assets/og-devtools.png', import.meta.url)),
        }),
      },
    }),
    ui.page(trials, {
      views: [Header, Trials, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: 'Hozu trials',
          description: 'Measured correctness and agent cost, with methods and limitations.',
          image: share,
        }),
      },
    }),
    ui.page(trial, {
      views: [Header, Trial, Footer],
      assert: 'static',
      head: {
        query: getTrial,
        input: (params) => ({ slug: params.slug }),
        failed: { NotFound: 404 },
        render: (article) => ({
          title: article.title,
          description: article.description,
          type: 'article',
          image: share,
        }),
      },
      entries: { query: listTrials, input: {}, params: (item) => ({ slug: item.slug }) },
    }),
    ui.page(changelog, {
      views: [Header, Changelog, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: 'Hozu changelog',
          description: 'What changed in each Hozu release.',
          image: share,
        }),
      },
    }),
    ui.page(notFound, {
      views: [Header, NotFound, Footer],
      assert: 'static',
      head: { render: () => ({ title: 'Page not found — Hozu', noindex: true, image: share }) },
    }),
  ],
  kits: [kit],
  features: [content, homePage, lab],
})
