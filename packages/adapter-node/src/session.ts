import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface SessionStore {
  read(request: IncomingMessage): unknown
  write(response: ServerResponse, value: unknown): void
}

export interface SessionCookieOptions {
  name: string
  secret: string
  maxAge?: number
  secure?: boolean
}

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url')

export function sessionCookie({
  name,
  secret,
  maxAge = 60 * 60 * 24 * 30,
  secure = true,
}: SessionCookieOptions): SessionStore {
  if (secret.length < 32) throw new Error('sessionCookie secret must be at least 32 characters')
  const attributes = `; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  return {
    read(request) {
      const raw = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.cookie ?? '')?.[1]
      if (!raw) return null
      const [payload, signature] = raw.split('.')
      if (!payload || !signature) return null
      const expected = Buffer.from(sign(secret, payload))
      const given = Buffer.from(signature)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
      try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      } catch {
        return null
      }
    },
    write(response, value) {
      if (value === null) {
        response.appendHeader('set-cookie', `${name}=${attributes}; Max-Age=0`)
        return
      }
      const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
      response.appendHeader(
        'set-cookie',
        `${name}=${payload}.${sign(secret, payload)}${attributes}; Max-Age=${maxAge}`,
      )
    },
  }
}
