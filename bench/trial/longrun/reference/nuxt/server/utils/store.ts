import type { Note } from '#shared/types/note'

export const NOTE_MAX = 100

let nextId = 1
const newNote = (text: string): Note => ({ id: `n${nextId++}`, text })

const notesByUser = new Map<string, Note[]>([
  ['ada', [newNote('Buy milk'), newNote('Call Bob')]],
  ['bob', [newNote("Bob's secret")]],
])

export function notesOf(user: string): Note[] {
  let notes = notesByUser.get(user)
  if (!notes) {
    notes = []
    notesByUser.set(user, notes)
  }
  return notes
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function addNote(user: string, raw: string): string | null {
  const text = raw.trim()
  if (text.length < 1 || text.length > NOTE_MAX) return `Notes are 1–${NOTE_MAX} characters`
  const notes = notesOf(user)
  if (notes.some((note) => sameText(note.text, text))) return 'You already have this note'
  notes.unshift(newNote(text))
  return null
}

export function deleteNote(user: string, id: string): void {
  const notes = notesOf(user)
  const index = notes.findIndex((note) => note.id === id)
  if (index >= 0) notes.splice(index, 1)
}
