import { z } from 'zod'

export const Show = z.enum(['all', 'open', 'done'])
export const Task = z.object({ id: z.string(), title: z.string(), done: z.boolean() })
export const Tasks = z.array(Task)
export const TaskKey = z.object({ id: z.string() })
export const NewTask = z.object({
  title: z.string().min(3, 'Use at least 3 characters').max(80, 'Use at most 80 characters'),
})
export const NoInput = z.object({})
export const Context = z.object({
  show: Show,
  draft: z.string(),
  target: z.string(),
  error: z.string().nullable(),
  fields: z.object({ title: z.string().nullable() }),
})
