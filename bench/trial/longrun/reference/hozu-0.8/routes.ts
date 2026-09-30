import { route } from '@hozu/core'
import { z } from 'zod'

export const PAGE = 5

export const list = route({
  path: '/notes',
  params: null,
  search: z.object({
    q: z.string().default(''),
    limit: z.number().default(PAGE),
  }),
})
export const login = route({
  path: '/login',
  params: null,
  search: z.object({ deleted: z.boolean().default(false) }),
})
export const archive = route({ path: '/archive', params: null, search: null })
export const admin = route({ path: '/admin', params: null, search: null })
export const accountDelete = route({ path: '/account/delete', params: null, search: null })
