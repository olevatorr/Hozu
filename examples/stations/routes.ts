import { route } from '@hozu/core'
import { z } from 'zod'

export const home = route({
  path: '/',
  params: null,
  search: z.object({ q: z.string().default(''), district: z.string().default('') }),
})
