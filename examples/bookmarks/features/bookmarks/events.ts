import { event } from '@tenon/core'
import { z } from 'zod'
import { BookmarkKey, Kind } from './schemas.ts'

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string(), kind: Kind }) })
export const ToggleRead = event({ payload: BookmarkKey })
