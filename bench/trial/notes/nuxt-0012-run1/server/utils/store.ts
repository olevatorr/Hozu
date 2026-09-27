import type { H3Event } from 'h3'

export interface Note {
  id: string
  text: string
  pinned?: boolean
}

const SESSION_COOKIE = 'notes_session'
const NAME_RE = /^\p{L}{2,20}$/u

const notesByUser = new Map<string, Note[]>([
  [
    'ada',
    [
      { id: crypto.randomUUID(), text: 'Buy milk' },
      { id: crypto.randomUUID(), text: 'Call Bob' },
    ],
  ],
  ['bob', [{ id: crypto.randomUUID(), text: "Bob's secret" }]],
])

const sessions = new Map<string, string>()

export function isValidName(name: unknown): name is string {
  return typeof name === 'string' && NAME_RE.test(name)
}

export function getNotes(user: string): Note[] {
  let notes = notesByUser.get(user)
  if (!notes) {
    notes = []
    notesByUser.set(user, notes)
  }
  return notes
}

/** Pinned notes first; otherwise keeps the stored (newest-first) order. */
export function sortNotes<T extends { pinned?: boolean }>(notes: T[]): T[] {
  return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
}

export function signIn(event: H3Event, name: string) {
  const sid = crypto.randomUUID()
  sessions.set(sid, name)
  getNotes(name)
  setCookie(event, SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'lax', path: '/' })
}

export function signOut(event: H3Event) {
  const sid = getCookie(event, SESSION_COOKIE)
  if (sid) sessions.delete(sid)
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export function currentUser(event: H3Event): string | null {
  const sid = getCookie(event, SESSION_COOKIE)
  return (sid && sessions.get(sid)) || null
}

/** Native (no-JS) form posts are urlencoded; enhanced requests from $fetch send JSON. */
export function isFormPost(event: H3Event): boolean {
  return (getHeader(event, 'content-type') ?? '').includes('application/x-www-form-urlencoded')
}
