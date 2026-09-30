import { machine } from '@hozu/core'
import { z } from 'zod'

export const Note = z.object({ id: z.string(), text: z.string(), pinned: z.boolean() })
export type Note = z.infer<typeof Note>

export const board = machine({
  context: z.object({ notes: z.array(Note), error: z.string().nullable() }),
  initialContext: {
    notes: [
      { id: 'n1', text: 'Buy milk', pinned: false },
      { id: 'n2', text: 'Call Bob', pinned: false },
    ],
    error: null,
  },
  initial: 'ready',
  states: () => ({ ready: {} }),
})
