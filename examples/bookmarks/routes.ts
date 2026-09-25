import { route } from '@tenon/core'
import { z } from 'zod'
import { Show } from './features/bookmarks/schemas.ts'

export const home = route({ path: '/', params: null, search: z.object({ show: Show.default('all') }) })
export const bookmarkPage = route({
  path: '/bookmarks/:id',
  params: z.object({ id: z.string() }),
  search: null,
})
