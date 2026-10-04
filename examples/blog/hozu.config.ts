import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'
import { getPost, listPosts } from './features/posts/effects.ts'
import { posts } from './features/posts/feature.ts'
import { text } from './features/posts/messages.ts'
import { Article, Offline, PostList } from './features/posts/views.ts'
import { saved } from './features/saved/feature.ts'
import { ReadingList } from './features/saved/views.ts'
import { home, offline, post } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  session: z.object({ userId: z.string() }),
  site: { url: 'https://blog.hozu.dev', name: 'Hozu Blog', locales: ['en', 'zh-TW'], offline, lang: 'en' },
  routes: { home, post, offline },
  pages: [
    ui.page(home, {
      views: [PostList, ReadingList],
      head: { render: () => ({ title: text.title, description: text.description }) },
    }),
    ui.page(post, {
      views: [Article],
      assert: 'static',
      head: {
        query: getPost,
        input: (params) => ({ slug: params.slug }),
        failed: { NotFound: 404 },
        render: (article) => ({
          title: article.title,
          description: article.excerpt,
          type: 'article',
          image: ui.og({ title: article.title, subtitle: article.excerpt }),
          published: article.publishedAt,
        }),
      },
      entries: {
        query: listPosts,
        input: {},
        params: (summary) => ({ slug: summary.slug }),
        lastmod: (summary) => summary.publishedAt,
      },
    }),
    ui.page(offline, {
      views: [Offline],
      assert: 'static',
      head: { render: () => ({ title: text.offline, description: text.offlineHint, noindex: true }) },
    }),
  ],
  features: [posts, saved],
})
