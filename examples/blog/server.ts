import { loadCollection } from '@tenon/content'
import { resolvers } from '@tenon/data'
import { getPost, listPosts } from './features/posts/effects.ts'
import { Frontmatter } from './features/posts/schemas.ts'
import { savedPosts, savePost, unsavePost } from './features/saved/effects.ts'
import project from './tenon.config.ts'

const posts = (
  await loadCollection({ dir: new URL('./content/posts/', import.meta.url), schema: Frontmatter })
).map(({ slug, data, html }) => ({ slug, ...data, html }))

const who = (session: { userId: string } | null) => session?.userId ?? 'guest'

export function createResolvers() {
  const lists = new Map<string, string[]>()
  return resolvers(project, (implement) => [
    implement(listPosts, () => posts.map(({ html: _, author: __, ...summary }) => summary)),
    implement(
      getPost,
      ({ slug }, { fail }) => posts.find((p) => p.slug === slug) ?? fail('NotFound', { slug }),
    ),
    implement(savedPosts, (_, { session }) => lists.get(who(session)) ?? []),
    implement(savePost, ({ slug }, { session, fail }) => {
      const list = lists.get(who(session)) ?? []
      if (list.length >= 20) return fail('LimitReached', { limit: 20 })
      const next = list.includes(slug) ? list : [...list, slug]
      lists.set(who(session), next)
      return next
    }),
    implement(unsavePost, ({ slug }, { session }) => {
      const next = (lists.get(who(session)) ?? []).filter((s) => s !== slug)
      lists.set(who(session), next)
      return next
    }),
  ])
}
