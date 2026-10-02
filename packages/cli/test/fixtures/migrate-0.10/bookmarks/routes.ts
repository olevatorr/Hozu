import { route } from '@hozu/core'
import { z } from 'zod'

export const Show = z.enum(['all', 'unread'])

export const home = route({ path: '/', params: null, search: z.object({ show: Show.default('all') }) })
export const bookmarkPage = route({
  path: '/bookmarks/:id',
  params: z.object({ id: z.string() }),
  search: null,
})
