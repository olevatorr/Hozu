import { project } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { z } from 'zod'
import { posts } from './features/posts/feature.ts'
import { HelloTenon, IslandsExplained, PostList } from './features/posts/views.ts'
import { saved } from './features/saved/feature.ts'
import { ReadingList } from './features/saved/views.ts'
import { helloTenon, home, islandsExplained } from './routes.ts'

export default project({
  schema: zodAdapter,
  session: z.object({ userId: z.string() }),
  routes: { home, helloTenon, islandsExplained },
  pages: [
    { route: home, views: [PostList, ReadingList], assert: null },
    { route: helloTenon, views: [HelloTenon], assert: 'static' },
    { route: islandsExplained, views: [IslandsExplained], assert: 'static' },
  ],
  features: [posts, saved],
})
