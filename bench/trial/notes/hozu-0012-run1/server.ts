import { resolvers } from '@hozu/data'
import { signIn, whoami } from './features/auth/model.ts'
import { addNote, deleteNote, listNotes, signOut, togglePin } from './features/notes/model.ts'
import project from './hozu.config.ts'

type Note = { id: string; text: string; pinned: boolean }

export function createResolvers() {
  const store = new Map<string, Note[]>([
    [
      'ada',
      [
        { id: 'n1', text: 'Buy milk', pinned: false },
        { id: 'n2', text: 'Call Bob', pinned: false },
      ],
    ],
    ['bob', [{ id: 'n3', text: "Bob's secret", pinned: false }]],
  ])
  let seq = 3
  const notesOf = (user: string) => {
    const key = user.toLowerCase()
    let list = store.get(key)
    if (!list) store.set(key, (list = []))
    return list
  }
  return resolvers(project, (implement) => [
    implement(whoami, (_input, { session, fail }) =>
      session ? { name: session.user } : fail('SignedOut', {}),
    ),
    implement(signIn, ({ name }, { setSession }) => {
      setSession({ user: name })
      return { name }
    }),
    implement(signOut, (_input, { setSession }) => {
      setSession(null)
      return {}
    }),
    implement(listNotes, (_input, { session }) => {
      const list = session ? notesOf(session.user) : []
      return {
        count: list.length,
        notes: [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)].map((n) => ({ ...n })),
      }
    }),
    implement(addNote, ({ text }, { session, fail }) => {
      if (!session) throw new Error('Sign in first')
      const list = notesOf(session.user)
      const clean = text.trim()
      if (list.some((n) => n.text.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { text: clean })
      const note = { id: `n${++seq}`, text: clean, pinned: false }
      list.unshift(note)
      return { ...note }
    }),
    implement(deleteNote, ({ id }, { session, fail }) => {
      const list = session ? notesOf(session.user) : []
      const i = list.findIndex((n) => n.id === id)
      if (i < 0) return fail('NotFound', { id })
      list.splice(i, 1)
      return { id }
    }),
    implement(togglePin, ({ id }, { session, fail }) => {
      const note = (session ? notesOf(session.user) : []).find((n) => n.id === id)
      if (!note) return fail('NotFound', { id })
      note.pinned = !note.pinned
      return { ...note }
    }),
  ])
}
