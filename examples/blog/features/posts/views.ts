import { ui } from '@tenon/core'
import { post } from '../../routes.ts'
import { getPost, listPosts } from './effects.ts'

export const PostList = ui.view({
  machine: null,
  route: null,
  render: () =>
    ui.section({ class: 'mx-auto max-w-2xl space-y-8 px-4 py-12 font-sans' }, [
      ui.h1({ class: 'text-4xl font-bold tracking-tight text-gray-900 dark:text-white' }, ['Tenon Blog']),
      ui.query(
        listPosts,
        {},
        {
          ready: (posts) =>
            ui.ul({ class: 'grid gap-6 sm:grid-cols-2' }, [
              ui.each(posts, 'slug', (entry) =>
                ui.li(
                  {
                    class:
                      'group rounded-2xl border border-gray-200 p-6 transition hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-lg dark:border-gray-800',
                  },
                  [
                    ui.h2({ class: 'text-xl font-semibold group-hover:text-brand-700' }, [
                      ui.a(
                        {
                          href: ui.link(post, { slug: entry.slug }),
                          class: 'focus-visible:outline-2 focus-visible:outline-brand-600',
                        },
                        [entry.title],
                      ),
                    ]),
                    ui.p({ class: 'mt-2 text-gray-600 dark:text-gray-300' }, [entry.excerpt]),
                    ui.small({ class: 'mt-4 block text-xs uppercase tracking-wide text-gray-500' }, [
                      entry.publishedAt,
                    ]),
                  ],
                ),
              ),
            ]),
          pending: ui.p({}, ['Loading posts…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Posts are unavailable']) },
        },
      ),
    ]),
})

export const Article = ui.view({
  machine: null,
  route: post,
  render: ({ params }) =>
    ui.query(
      getPost,
      { slug: params.slug },
      {
        ready: (post) =>
          ui.article({ class: 'prose prose-lg mx-auto px-4 py-12 dark:prose-invert' }, [
            ui.h1({}, [post.title]),
            ui.p({ class: 'text-sm text-gray-500' }, ['By ', post.author, ' · ', post.publishedAt]),
            ui.each(post.body, 'text', (paragraph) => ui.p({}, [paragraph.text])),
          ]),
        pending: null,
        failed: {
          NotFound: () => ui.p({ role: 'alert' }, ['Post not found']),
          Unexpected: () => ui.p({ role: 'alert' }, ['Post unavailable']),
        },
      },
    ),
})
