export interface SessionStore {
  read(request: Request): Promise<unknown>
  write(value: unknown): Promise<string>
}

export interface SessionCookieOptions {
  name: string
  secret: string
  maxAge?: number
  secure?: boolean
}

const encoder = new TextEncoder()

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export function sessionCookie({
  name,
  secret,
  maxAge = 60 * 60 * 24 * 30,
  secure = true,
}: SessionCookieOptions): SessionStore {
  if (secret.length < 32) throw new Error('sessionCookie secret must be at least 32 characters')
  const attributes = `; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  const key = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return {
    async read(request) {
      const raw = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get('cookie') ?? '')?.[1]
      const [payload, signature] = raw?.split('.') ?? []
      if (!payload || !signature) return null
      try {
        const valid = await crypto.subtle.verify(
          'HMAC',
          await key,
          fromBase64url(signature),
          encoder.encode(payload),
        )
        return valid ? JSON.parse(new TextDecoder().decode(fromBase64url(payload))) : null
      } catch {
        return null
      }
    },
    async write(value) {
      if (value === null) return `${name}=${attributes}; Max-Age=0`
      const payload = base64url(encoder.encode(JSON.stringify(value)))
      const signature = base64url(
        new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(payload))),
      )
      return `${name}=${payload}.${signature}${attributes}; Max-Age=${maxAge}`
    },
  }
}
