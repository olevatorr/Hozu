import { event } from '@tenon/core'
import { z } from 'zod'
import { Priority, Show, TaskKey } from './schemas.ts'

export const SetShow = event({ payload: z.object({ show: Show }) })
export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string(), priority: Priority }) })
export const Toggle = event({ payload: TaskKey })
export const ClearDone = event({ payload: z.object({}) })
