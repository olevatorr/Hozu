export interface Note {
  id: string
  text: string
}

export interface NotesPage {
  user: string
  count: number
  notes: Note[]
  flash: string | null
}

export interface ActionResult {
  redirect: string
}
