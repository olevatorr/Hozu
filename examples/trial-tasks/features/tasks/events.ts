import { event } from '@tenon/core'
import { z } from 'zod'
import { Filter, NoInput, TaskKey, TitleInput } from './schemas.ts'

export const SetFilter = event({ payload: z.object({ filter: Filter }) })
export const Draft = event({ payload: z.object({ text: z.string() }) })
export const AddTask = event({ payload: TitleInput })
export const ToggleTask = event({ payload: TaskKey })
export const SetPriority = event({ payload: z.object({ priority: z.string() }) })
export const ClearDone = event({ payload: NoInput })
