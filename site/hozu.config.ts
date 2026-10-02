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
import { Home } from './features/home/views.ts'
import { How, lab } from './features/lab/views.ts'
import { changelog, chapter, devtools, doc, home, how, notFound, trial, trials } from './routes.ts'
import { kit } from './site/kit.ts'

const icon = ui.asset(new URL('./assets/icon-256.png', import.meta.url))
export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'https://hozu.org', name: 'Hozu', lang: 'en', icon, themeColor: '#f1ede4' },
  notFound,
  routes: { home, doc, trials, trial, changelog, notFound, how, chapter, devtools },
  pages: [
    ui.page(how, {
      views: [Header, How, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: 'How Hozu works',
          description: 'Explore the design, its checks and its trade-offs.',
          image: icon,
        }),
      },
    }),
    ui.page(chapter, {
      views: [Header, Chapter, Footer],
      assert: 'static',
      head: {
        query: getChapter,
        input: (params) => ({ slug: params.slug }),
        failed: { NotFound: 404 },
        render: (article) => ({ title: article.title, description: article.description, image: icon }),
      },
      entries: { query: listChapters, input: {}, params: (item) => ({ slug: item.slug }) },
    }),
    ui.page(home, {
      views: [Header, Home, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: 'Hozu — An AI-first web framework',
          description: 'Invalid programs are hard to express. Valid programs are cheap to verify.',
          image: icon,
        }),
      },
    }),
    ui.page(doc, {
      views: [Header, Docs, Footer],
      assert: 'static',
      head: {
        query: getDoc,
        input: (params) => ({ slug: params.slug }),
        failed: { NotFound: 404 },
        render: (article) => ({ title: article.title, description: article.description, image: icon }),
      },
      entries: { query: listDocs, input: {}, params: (item) => ({ slug: item.slug }) },
    }),
    ui.page(devtools, {
      views: [Header, DevToolsPage, Footer],
      assert: 'static',
      head: {
        render: () => ({
          title: 'Hozu DevTools',
          description:
            'Point at the screen; your agent gets the file, the line and the Hozu way to change it.',
          image: ui.asset(new URL('./assets/devtools-select.png', import.meta.url)),
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
          image: icon,
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
          image: icon,
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
          image: icon,
        }),
      },
    }),
    ui.page(notFound, {
      views: [Header, NotFound, Footer],
      assert: 'static',
      head: { render: () => ({ title: 'Page not found — Hozu', noindex: true, image: icon }) },
    }),
  ],
  kits: [kit],
  features: [content, homePage, lab],
})
