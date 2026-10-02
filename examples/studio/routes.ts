import { route } from '@hozu/core'
import { z } from 'zod'

export const Status = z.enum(['todo', 'doing', 'done'])
export const Show = z.enum(['all', 'todo', 'doing', 'done'])

export const board = route({ path: '/', params: null, search: z.object({ show: Show.default('all') }) })
export const taskPage = route({ path: '/tasks/:id', params: z.object({ id: z.string() }), search: null })
