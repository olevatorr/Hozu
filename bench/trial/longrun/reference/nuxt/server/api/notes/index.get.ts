import type { NotesPage } from '#shared/types/note'

export default defineEventHandler((event): NotesPage => {
  const user = requireUser(event)
  const notes = notesOf(user)
  return { user, count: notes.length, notes, flash: takeFlash(event) }
})
