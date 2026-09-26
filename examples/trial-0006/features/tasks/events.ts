import { event } from '@tenon/core'
import { z } from 'zod'
import { Show, TaskKey } from './schemas.ts'

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const Toggle = event({ payload: TaskKey })
export const SetShow = event({ payload: z.object({ show: Show }) })
