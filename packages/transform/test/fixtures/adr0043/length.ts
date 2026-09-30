import { fn, ui } from '@hozu/core'
import { z } from 'zod'
import { board, Note } from './board.ts'

export const unpinned = fn({
  input: z.object({ notes: z.array(Note) }),
  output: z.array(Note),
  impl: ({ notes }) => notes.filter((n) => !n.pinned),
})

export const View = ui.view({
  machine: board,
  render: ({ ctx }) => ui.p({}, [`Showing ${unpinned({ notes: ctx.notes }).length}`]),
})

export { board }
