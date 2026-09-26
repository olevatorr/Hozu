import { feature } from '@tenon/core'
import { getPost, listPosts, postsTag, postTag } from './effects.ts'
import { text } from './messages.ts'
import { Article, Offline, PostList } from './views.ts'

export const posts = feature({
  id: 'posts',
  intent: {
    summary: 'Public blog posts: the index and one page per article. Fully cacheable, ships no JavaScript.',
    invariants: ['Only public data', 'Articles are static until their tag is revalidated'],
  },
  declarations: { postsTag, postTag, listPosts, getPost, PostList, Article, Offline, text },
  exports: [listPosts, PostList],
})
