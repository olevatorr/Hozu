import { ui } from '@hozu/core'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import {
  ADMIN,
  accounts,
  deleteAccount,
  landing,
  me,
  type Session,
  signIn,
  signOut,
} from './features/account/model.ts'
import {
  addNote,
  archiveNote,
  bulkNotes,
  exportAll,
  lastDeleted,
  listArchived,
  listNotes,
  MAX_TITLE,
  matches,
  notesApi,
  removeNote,
  renameNote,
  restoreNote,
  sharedWithMe,
  shareNote,
  TOO_LONG,
  togglePin,
  undoDelete,
  unshareNote,
} from './features/notes/model.ts'
import project from './hozu.config.ts'
import { list, login } from './routes.ts'
import { createStore, type Note } from './store.ts'

const RATE_LIMIT = 10
const RATE_WINDOW = 60_000
const titleError = (clean: string) =>
  !clean ? 'Write something' : clean.length > MAX_TITLE ? TOO_LONG : null
const userOf = (session: Session | null) => session?.user ?? null
const copy = (n: Note) => ({ ...n, sharedWith: [...n.sharedWith] })
const store = createStore()

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(me, (_, { session, fail }) => {
      const user = userOf(session)
      return user ? { name: user } : fail('Unauthorized', {})
    }),
    implement(landing, (_, { session, redirect }) =>
      userOf(session) ? redirect(ui.link(list, null)) : redirect(ui.link(login, null)),
    ),
    implement(accounts, (_, { session, fail }) => {
      const user = userOf(session)
      if (!user) return fail('Unauthorized', {})
      return user === ADMIN ? store.users() : fail('Forbidden', {})
    }),
    implement(signIn, ({ name }, { setSession }) => {
      const user = name.trim().toLowerCase()
      store.join(user)
      setSession({ user })
      return {}
    }),
    implement(signOut, (_, { session, setSession }) => {
      const user = userOf(session)
      if (user) store.forget(user)
      setSession(null)
      return {}
    }),
    implement(deleteAccount, (_, { session, setSession }) => {
      const user = userOf(session)
      if (user) store.leave(user)
      setSession(null)
      return {}
    }),
    implement(notesApi, (_, { session }) => {
      const user = userOf(session)
      return { signedIn: user !== null, notes: user ? store.active(user).map(copy) : [] }
    }),
    implement(exportAll, (_, { session, fail }) => {
      const user = userOf(session)
      if (!user) return fail('Unauthorized', { message: 'Sign in first' })
      const notes = store
        .all(user)
        .map(({ title, pinned, archived, createdAt }) => ({ title, pinned, archived, createdAt }))
      return { user, notes }
    }),
    implement(listNotes, ({ q, limit }, { session, fail }) => {
      const user = userOf(session)
      if (!user) return fail('Unauthorized', {})
      const all = store.active(user)
      const selected = all.filter((n) => matches(n, q))
      return { notes: selected.slice(0, limit).map(copy), matching: selected.length, total: all.length }
    }),
    implement(listArchived, (_, { session, fail }) => {
      const user = userOf(session)
      return user ? store.archived(user).map(copy) : fail('Unauthorized', {})
    }),
    implement(bulkNotes, ({ action, ids: picked }, { session, redirect }) => {
      const user = userOf(session)
      if (user) {
        const ids = picked.filter((id) => store.find(user, id))
        if (ids.length) store.forget(user)
        for (const id of ids)
          if (action === 'archive') store.find(user, id)!.archived = true
          else if (action === 'delete') store.remove(user, id, false)
      }
      return user ? redirect(ui.link(list, null)) : redirect(ui.link(login, null))
    }),
    implement(sharedWithMe, (_, { session }) => {
      const user = userOf(session)
      return user ? store.sharedWith(user) : []
    }),
    implement(shareNote, ({ id, to }, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.find(user, id)
      if (!user || !note) return fail('NotFound', { id })
      const name = to.trim().toLowerCase()
      if (name === user) return fail('Self', {})
      if (!note.sharedWith.includes(name)) note.sharedWith.push(name)
      return { id }
    }),
    implement(unshareNote, ({ id, to }, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.find(user, id)
      if (!note) return fail('NotFound', { id })
      note.sharedWith = note.sharedWith.filter((name) => name !== to)
      return { id }
    }),
    implement(lastDeleted, (_, { session }) => {
      const user = userOf(session)
      const note = user && store.lastDeleted(user)
      return note ? { title: note.title } : null
    }),
    implement(undoDelete, (_, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.undo(user)
      return note ? { id: note.id } : fail('NotFound', {})
    }),
    implement(addNote, ({ title }, { session, fail }) => {
      const user = userOf(session)
      if (!user) return fail('Invalid', { message: 'Signed out', fields: { title: 'Sign in first' } })
      const clean = title.trim()
      const error = titleError(clean)
      if (error) return fail('Invalid', { message: `title: ${error}`, fields: { title: error } })
      if (store.taken(user, clean)) return fail('Duplicate', { title: clean })
      if (store.addedSince(user, Date.now() - RATE_WINDOW) >= RATE_LIMIT) return fail('TooMany', {})
      store.forget(user)
      return copy(store.add(user, clean))
    }),
    implement(removeNote, ({ id }, { session, fail }) => {
      const user = userOf(session)
      if (!user || !store.find(user, id)) return fail('NotFound', { id })
      store.remove(user, id)
      return { id }
    }),
    implement(renameNote, ({ id, title }, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.find(user, id)
      if (!user || !note) return fail('NotFound', { id })
      const clean = title.trim()
      const error = titleError(clean)
      if (error) return fail('Invalid', { message: error, fields: { title: error } })
      if (store.taken(user, clean, id)) return fail('Duplicate', { title: clean })
      store.forget(user)
      note.title = clean
      return copy(note)
    }),
    implement(togglePin, ({ id }, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.find(user, id)
      if (!note) return fail('NotFound', { id })
      store.forget(user)
      note.pinned = !note.pinned
      return copy(note)
    }),
    implement(archiveNote, ({ id }, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.find(user, id)
      if (!note) return fail('NotFound', { id })
      store.forget(user)
      note.archived = true
      return { id }
    }),
    implement(restoreNote, ({ id }, { session, fail }) => {
      const user = userOf(session)
      const note = user && store.find(user, id, true)
      if (!note) return fail('NotFound', { id })
      store.forget(user)
      note.archived = false
      return { id }
    }),
  ]),
})
