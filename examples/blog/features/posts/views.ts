import { ui } from '@tenonkit/core'
import { post } from '../../routes.ts'
import { getPost, listPosts } from './effects.ts'
import { text } from './messages.ts'

const Languages = ui.nav({ 'aria-label': text.languages, class: 'flex gap-3 text-sm' }, [
  ui.a({ href: ui.alternate('en'), hreflang: 'en', lang: 'en' }, ['English']),
  ui.a({ href: ui.alternate('zh-TW'), hreflang: 'zh-TW', lang: 'zh-TW' }, ['中文']),
])

export const PostList = ui.view({
  render: () =>
    ui.section({ class: 'mx-auto max-w-2xl space-y-8 px-4 py-12 font-sans' }, [
      Languages,
      ui.img({
        src: ui.asset(new URL('../../hero.jpg', import.meta.url)),
        alt: '',
        width: 1600,
        height: 600,
        class: 'h-auto w-full rounded-2xl',
      }),
      ui.h1({ class: 'text-4xl font-bold tracking-tight text-gray-900 dark:text-white' }, [text.heading]),
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
                      ui.format.date(entry.publishedAt, { dateStyle: 'medium' }),
                    ]),
                  ],
                ),
              ),
            ]),
          pending: ui.p({}, [text.loading]),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, [text.unavailable]) },
        },
      ),
    ]),
})

export const Article = ui.view({
  route: post,
  render: ({ params }) =>
    ui.query(
      getPost,
      { slug: params.slug },
      {
        ready: (post) =>
          ui.article({ class: 'prose prose-lg mx-auto px-4 py-12 dark:prose-invert' }, [
            Languages,
            ui.h1({}, [post.title]),
            ui.p({ class: 'text-sm text-gray-500' }, [
              text.byline({
                author: post.author,
                date: ui.format.date(post.publishedAt, { dateStyle: 'long' }),
              }),
            ]),
            ui.div({}, [ui.html(post.html)]),
          ]),
        pending: null,
        failed: {
          NotFound: () => ui.p({ role: 'alert' }, [text.notFound]),
          Unexpected: () => ui.p({ role: 'alert' }, [text.postUnavailable]),
        },
      },
    ),
})

export const Offline = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-2xl space-y-4 px-4 py-12' }, [
      ui.h1({ class: 'text-2xl font-bold' }, [text.offline]),
      ui.p({}, [text.offlineHint]),
    ]),
})
