import { z } from 'zod'

export const Show = z.enum(['all', 'open', 'done'])
export const Priority = z.enum(['low', 'normal', 'high'])
export const Task = z.object({ id: z.string(), title: z.string(), done: z.boolean(), priority: Priority })
export const Tasks = z.array(Task)
export const TaskKey = z.object({ id: z.string() })
export const NewTask = z.object({ title: z.string(), priority: Priority })
export const Cleared = z.object({ removed: z.number() })
export const NoInput = z.object({})
export const Context = z.object({
  show: Show,
  draft: z.string(),
  priority: Priority,
  target: z.string(),
  error: z.string().nullable(),
})
