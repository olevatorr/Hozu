import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { getPost, listPosts } from './features/posts/effects.ts'
import { posts } from './features/posts/feature.ts'
import { Article, PostList } from './features/posts/views.ts'
import { saved } from './features/saved/feature.ts'
import { ReadingList } from './features/saved/views.ts'
import { home, post } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  http: null,
  notFound: null,
  error: null,
  session: z.object({ userId: z.string() }),
  site: { url: 'https://blog.tenon.dev', name: 'Tenon Blog', lang: 'en', icon: null, themeColor: null },
  routes: { home, post },
  pages: [
    ui.page(home, {
      views: [PostList, ReadingList],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Tenon Blog — notes on AI-first frontends',
          description: 'Articles about building verifiable, AI-friendly web apps with Tenon.',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
    ui.page(post, {
      views: [Article],
      assert: 'static',
      head: {
        redirects: null,
        query: getPost,
        input: (params) => ({ slug: params.slug }),
        render: (article) => ({
          title: article.title,
          description: article.excerpt,
          type: 'article',
          image: null,
          published: article.publishedAt,
          noindex: false,
        }),
      },
      entries: { query: listPosts, input: {}, params: (summary) => ({ slug: summary.slug }) },
    }),
  ],
  features: [posts, saved],
})
