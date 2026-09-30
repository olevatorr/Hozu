import { fn, part, ui } from '@hozu/core'
import { z } from 'zod'
import type { Note } from './board.ts'

export const pinnedBadge = part((note: Note) => note.pinned && ui.span({ class: 'badge' }, ['pinned']))

export const plainBadge = (note: Note) => ui.span({ class: 'badge' }, [note.text])

export const shout = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => text.toUpperCase(),
})
