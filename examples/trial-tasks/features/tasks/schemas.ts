import { z } from 'zod'

export const Priority = z.enum(['low', 'normal', 'high'])
export const Task = z.object({ id: z.string(), title: z.string(), done: z.boolean(), priority: Priority })
export const Tasks = z.array(Task)
export const Filter = z.enum(['all', 'open', 'done'])
export const TaskKey = z.object({ id: z.string() })
export const NewTask = z.object({ title: z.string(), priority: Priority })
export const TitleInput = z.object({ title: z.string() })
export const Cleared = z.object({ removed: z.number() })
export const NoInput = z.object({})
export const Context = z.object({
  filter: Filter,
  draft: z.string(),
  title: z.string(),
  priority: Priority,
  target: z.string(),
  error: z.string().nullable(),
})
