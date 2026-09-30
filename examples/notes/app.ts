import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { ADMIN, accounts, me, signIn, signOut } from './features/account/model.ts'
import {
  addNote,
  listNotes,
  notesApi,
  pinNotes,
  removeNote,
  removeNotes,
  togglePin,
} from './features/notes/model.ts'
import project from './hozu.config.ts'

interface Note {
  id: string
  text: string
  pinned: boolean
}

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
const listOf = (user: string) => store.get(user) ?? []
const ownListOf = (user: string) => {
  const list = store.get(user) ?? []
  store.set(user, list)
  return list
}
const ordered = (list: Note[]) => [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)]

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(me, (_, { session, fail }) => (session ? { name: session.user } : fail('Unauthorized', {}))),
    implement(accounts, (_, { session, fail }) =>
      !session
        ? fail('Unauthorized', {})
        : session.user !== ADMIN
          ? fail('Forbidden', {})
          : [...store].map(([name, list]) => ({ name, notes: list.length })),
    ),
    implement(signIn, ({ name }, { setSession }) => {
      setSession({ user: name.trim().toLowerCase() })
      return {}
    }),
    implement(signOut, (_, { setSession }) => {
      setSession(null)
      return {}
    }),
    implement(notesApi, (_, { session }) => ({
      signedIn: session !== null,
      notes: session ? ordered(listOf(session.user)).map((n) => ({ ...n })) : [],
    })),
    implement(listNotes, (_, { session, fail }) =>
      session ? ordered(listOf(session.user)).map((n) => ({ ...n })) : fail('Unauthorized', {}),
    ),
    implement(addNote, ({ text }, { session, fail }) => {
      if (!session) return fail('Invalid', { message: 'Signed out', fields: { text: 'Sign in first' } })
      const clean = text.trim()
      if (!clean)
        return fail('Invalid', { message: 'text: Write something', fields: { text: 'Write something' } })
      const list = ownListOf(session.user)
      if (list.some((n) => n.text.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { text: clean })
      const note = { id: `n${++seq}`, text: clean, pinned: false }
      list.unshift(note)
      return { ...note }
    }),
    implement(removeNote, ({ id }, { session, fail }) => {
      const list = session ? ownListOf(session.user) : []
      const at = list.findIndex((n) => n.id === id)
      if (at < 0) return fail('NotFound', { id })
      list.splice(at, 1)
      return { id }
    }),
    implement(removeNotes, ({ ids }, { session }) => {
      const list = session ? ownListOf(session.user) : []
      const kept = list.filter((n) => !ids.includes(n.id))
      const count = list.length - kept.length
      list.splice(0, list.length, ...kept)
      return { count }
    }),
    implement(pinNotes, ({ ids }, { session }) => {
      const picked = (session ? ownListOf(session.user) : []).filter((n) => ids.includes(n.id))
      for (const n of picked) n.pinned = true
      return { count: picked.length }
    }),
    implement(togglePin, ({ id }, { session, fail }) => {
      const note = (session ? ownListOf(session.user) : []).find((n) => n.id === id)
      if (!note) return fail('NotFound', { id })
      note.pinned = !note.pinned
      return { ...note }
    }),
  ]),
})
