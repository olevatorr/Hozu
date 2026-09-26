import { event } from '@tenon/core'
import { z } from 'zod'

export const More = event({ payload: z.object({ cursor: z.string().nullable() }) })
