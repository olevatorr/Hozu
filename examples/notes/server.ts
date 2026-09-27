import { resolvers } from '@hozu/data'
import { me, signIn, signOut } from './features/account/model.ts'
import { addNote, listNotes, removeNote, togglePin } from './features/notes/model.ts'
import project from './hozu.config.ts'

interface Note {
  id: string
  text: string
  pinned: boolean
}

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
    const list = store.get(user) ?? []
    store.set(user, list)
    return list
  }
  const ordered = (list: Note[]) => [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)]
  return resolvers(project, (implement) => [
    implement(me, (_, { session, fail }) => (session ? { name: session.user } : fail('Unauthorized', {}))),
    implement(signIn, ({ name }, { setSession }) => {
      setSession({ user: name.trim().toLowerCase() })
      return {}
    }),
    implement(signOut, (_, { setSession }) => {
      setSession(null)
      return {}
    }),
    implement(listNotes, (_, { session, fail }) =>
      session ? ordered(notesOf(session.user)).map((n) => ({ ...n })) : fail('Unauthorized', {}),
    ),
    implement(addNote, ({ text }, { session, fail }) => {
      if (!session) return fail('Invalid', { message: 'Signed out', fields: { text: 'Sign in first' } })
      const clean = text.trim()
      if (!clean)
        return fail('Invalid', { message: 'text: Write something', fields: { text: 'Write something' } })
      const list = notesOf(session.user)
      if (list.some((n) => n.text.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { text: clean })
      const note = { id: `n${++seq}`, text: clean, pinned: false }
      list.unshift(note)
      return { ...note }
    }),
    implement(removeNote, ({ id }, { session, fail }) => {
      const list = session ? notesOf(session.user) : []
      const at = list.findIndex((n) => n.id === id)
      if (at < 0) return fail('NotFound', { id })
      list.splice(at, 1)
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
