import { route } from '@tenon/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null })
export const bookmarkPage = route({ path: '/bookmarks/:id', params: z.object({ id: z.string() }) })
