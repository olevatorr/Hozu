import { ui } from '@tenon/core'
import { post } from '../../routes.ts'
import { getPost, listPosts, postPath } from './effects.ts'

export const PostList = ui.view({
  machine: null,
  route: null,
  render: () =>
    ui.section({ class: 'space-y-6' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Tenon Blog']),
      ui.query(
        listPosts,
        {},
        {
          ready: (posts) =>
            ui.ul({ class: 'space-y-4' }, [
              ui.each(posts, 'slug', (post) =>
                ui.li({}, [
                  ui.h2({ class: 'text-xl' }, [ui.a({ href: postPath(post.slug) }, [post.title])]),
                  ui.p({ class: 'text-gray-600' }, [post.excerpt]),
                  ui.small({}, [post.publishedAt]),
                ]),
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
          ui.article({ class: 'prose' }, [
            ui.h1({}, [post.title]),
            ui.p({ class: 'text-sm' }, ['By ', post.author, ' · ', post.publishedAt]),
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
