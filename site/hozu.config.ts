import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { getDoc, getTrial, listDocs, listTrials } from './features/content/model.ts'
import {
  Changelog,
  content,
  Docs,
  Footer,
  Header,
  Home,
  NotFound,
  Trial,
  Trials,
} from './features/content/views.ts'
import { changelog, doc, home, notFound, trial, trials } from './routes.ts'

const icon = ui.asset(new URL('./assets/icon-256.png', import.meta.url))
export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'https://hozu.org', name: 'Hozu', lang: 'en', icon, themeColor: '#245ca6' },
  notFound,
  routes: { home, doc, trials, trial, changelog, notFound },
  pages: [
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
        render: (article) => ({ title: article.title, description: article.description, image: icon }),
      },
      entries: { query: listDocs, input: {}, params: (item) => ({ slug: item.slug }) },
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
  features: [content],
})
