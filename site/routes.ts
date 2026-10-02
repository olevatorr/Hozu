import { route } from '@hozu/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null, search: null })
export const doc = route({ path: '/docs/:slug', params: z.object({ slug: z.string() }), search: null })
export const trials = route({ path: '/trials', params: null, search: null })
export const trial = route({ path: '/trials/:slug', params: z.object({ slug: z.string() }), search: null })
export const devtools = route({ path: '/devtools', params: null, search: null })
export const changelog = route({ path: '/changelog', params: null, search: null })
export const notFound = route({ path: '/404', params: null, search: null })

export const how = route({ path: '/how-it-works', params: null, search: null })
export const chapter = route({
  path: '/how-it-works/:slug',
  params: z.object({ slug: z.string() }),
  search: null,
})
