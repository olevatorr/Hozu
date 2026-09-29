import type { H3Event } from 'h3'

interface Session {
  user?: string
  flash?: string
}

const COOKIE = 'sid'
const sessions = new Map<string, Session>()

export function findSession(event: H3Event): Session | undefined {
  const id = getCookie(event, COOKIE)
  return id ? sessions.get(id) : undefined
}

export function ensureSession(event: H3Event): Session {
  const existing = findSession(event)
  if (existing) return existing
  const id = crypto.randomUUID()
  const session: Session = {}
  sessions.set(id, session)
  setCookie(event, COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' })
  return session
}

export const currentUser = (event: H3Event) => findSession(event)?.user

export function requireUser(event: H3Event): string {
  const user = currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  return user
}

export function setFlash(event: H3Event, message: string | null): void {
  if (message) ensureSession(event).flash = message
}

export function takeFlash(event: H3Event): string | null {
  const session = findSession(event)
  const flash = session?.flash ?? null
  if (session) delete session.flash
  return flash
}
