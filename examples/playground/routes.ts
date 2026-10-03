import { route } from '@hozu/core'
import { z } from 'zod'

export const User = z.enum(['1', '2', '3'])

export const home = route({ path: '/', params: null, search: z.object({ user: User.default('1') }) })
