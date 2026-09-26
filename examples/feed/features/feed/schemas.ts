import { z } from 'zod'

export const Item = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  label: z.string(),
  year: z.string(),
})
export const Page = z.object({ items: z.array(Item), next: z.string().nullable() })
export const Context = z.object({ cursors: z.array(z.string().nullable()), last: z.string().nullable() })
