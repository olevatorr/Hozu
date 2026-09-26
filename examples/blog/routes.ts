import { route } from '@tenon/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null, search: null })
export const post = route({ path: '/posts/:slug', params: z.object({ slug: z.string() }), search: null })
export const offline = route({ path: '/offline', params: null, search: null })
