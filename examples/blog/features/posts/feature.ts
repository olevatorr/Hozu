import { feature } from '@tenon/core'
import { getPost, listPosts, postPath, postsTag, postTag } from './effects.ts'
import { Article, PostList } from './views.ts'

export const posts = feature({
  id: 'posts',
  intent: {
    summary: 'Public blog posts: the index and one page per article. Fully cacheable, ships no JavaScript.',
    invariants: ['Only public data', 'Articles are static until their tag is revalidated'],
  },
  imports: [],
  tags: { postsTag, postTag },
  events: {},
  queries: { listPosts, getPost },
  mutations: {},
  fns: { postPath },
  machine: null,
  views: { PostList, Article },
  contracts: {},
  exports: { events: [], queries: [listPosts], mutations: [], tags: [], fns: [], views: [PostList] },
})
