import { route } from '@hozu/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null, search: null })
export const taskPage = route({ path: '/tasks/:id', params: z.object({ id: z.string() }), search: null })
