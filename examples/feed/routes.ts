import { route } from '@tenonkit/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null, search: null })
export const tag = route({
  path: '/tags/:path+',
  params: z.object({ path: z.array(z.string()).min(1) }),
  search: null,
})
export const archive = route({
  path: '/archive/:year?',
  params: z.object({ year: z.string().nullable() }),
  search: null,
})
