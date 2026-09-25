import { resolvers } from '@tenon/data'
import { getPost, listPosts } from './features/posts/effects.ts'
import { savedPosts, savePost, unsavePost } from './features/saved/effects.ts'
import project from './tenon.config.ts'

const posts = [
  {
    slug: 'hello-tenon',
    title: 'Hello, Tenon',
    excerpt: 'Why an AI-first framework makes invalid programs hard to write.',
    publishedAt: '2026-09-01',
    author: 'Ada',
    body: [
      { text: 'Tenon compiles features into an IR that tools can verify.' },
      { text: 'Views are closed trees.' },
    ],
  },
  {
    slug: 'islands-explained',
    title: 'Islands, derived',
    excerpt: 'Only machine-bound nodes hydrate. Everything else ships zero JavaScript.',
    publishedAt: '2026-09-15',
    author: 'Grace',
    body: [{ text: 'Render modes are derived from data freshness and scope.' }],
  },
]

export function createResolvers() {
  const lists = new Map<string, string[]>()
  return resolvers(project, (implement) => [
    implement(listPosts, () => posts.map(({ body: _, author: __, ...summary }) => summary)),
    implement(
      getPost,
      ({ slug }, { fail }) => posts.find((p) => p.slug === slug) ?? fail('NotFound', { slug }),
    ),
    implement(savedPosts, (_, { session }) => lists.get(session.userId) ?? []),
    implement(savePost, ({ slug }, { session, fail }) => {
      const list = lists.get(session.userId) ?? []
      if (list.length >= 20) return fail('LimitReached', { limit: 20 })
      const next = list.includes(slug) ? list : [...list, slug]
      lists.set(session.userId, next)
      return next
    }),
    implement(unsavePost, ({ slug }, { session }) => {
      const next = (lists.get(session.userId) ?? []).filter((s) => s !== slug)
      lists.set(session.userId, next)
      return next
    }),
  ])
}
