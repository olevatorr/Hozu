import { route } from '@tenon/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null })
export const post = route({ path: '/posts/:slug', params: z.object({ slug: z.string() }) })
