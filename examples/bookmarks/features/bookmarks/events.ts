import { event } from '@tenon/core'
import { z } from 'zod'
import { BookmarkKey, Kind, Show } from './schemas.ts'

export const SetShow = event({ payload: z.object({ show: Show }) })
export const Draft = event({ payload: z.object({ text: z.string() }) })
export const PickKind = event({ payload: z.object({ kind: Kind }) })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const ToggleRead = event({ payload: BookmarkKey })
