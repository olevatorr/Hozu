import { event } from '@tenon/core'
import { z } from 'zod'
import { Tab } from './schemas.ts'

export const SelectTab = event({ payload: z.object({ tab: Tab }) })
export const Draft = event({ payload: z.object({ text: z.string() }) })
export const AddTodo = event({ payload: z.object({ title: z.string() }) })
export const RemoveTodo = event({ payload: z.object({ id: z.string() }) })
export const Shuffle = event({ payload: z.object({}) })
export const SelectMetric = event({ payload: z.object({ metric: z.string() }) })
export const SlideChanged = event({ payload: z.object({ index: z.number() }) })
export const ToggleSpin = event({ payload: z.object({}) })
