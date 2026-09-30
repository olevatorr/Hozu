export interface SessionStore {
  read(request: Request): Promise<unknown>
  write(value: unknown, request?: Request): Promise<string>
  issue(value: unknown): Promise<string>
}

export interface MemorySessionsOptions {
  name?: string
  secret?: string | undefined
  maxAge?: number
  secure?: boolean
  now?: () => number
}

const encoder = new TextEncoder()

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const random = (bytes: number) => base64url(crypto.getRandomValues(new Uint8Array(bytes)))

const cookieValue = (request: Request, name: string) =>
  new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get('cookie') ?? '')?.[1]

function signer(secret: string) {
  const key = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return {
    sign: async (text: string) =>
      base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(text)))),
    verify: async (text: string, signature: string) => {
      try {
        return await crypto.subtle.verify('HMAC', await key, fromBase64url(signature), encoder.encode(text))
      } catch {
        return false
      }
    },
  }
}

export function memorySessions({
  name = 'sid',
  secret: given,
  maxAge = 60 * 60 * 24 * 30,
  secure = true,
  now = Date.now,
}: MemorySessionsOptions = {}): SessionStore {
  const secret = given ?? random(32)
  if (secret.length < 32) throw new Error('memorySessions secret must be at least 32 characters')
  const attributes = `; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  const { sign, verify } = signer(secret)
  const sessions = new Map<string, { json: string; expires: number }>()
  const idOf = async (request: Request) => {
    const [id, signature] = cookieValue(request, name)?.split('.') ?? []
    return id && signature && (await verify(id, signature)) ? id : null
  }
  const create = async (value: unknown) => {
    const at = now()
    if (sessions.size > 1000) for (const [k, s] of sessions) if (s.expires <= at) sessions.delete(k)
    const id = random(18)
    sessions.set(id, { json: JSON.stringify(value), expires: at + maxAge * 1000 })
    return `${name}=${id}.${await sign(id)}`
  }
  return {
    async read(request) {
      const id = await idOf(request)
      const s = id ? sessions.get(id) : undefined
      if (!s) return null
      if (s.expires > now()) return JSON.parse(s.json)
      sessions.delete(id!)
      return null
    },
    async write(value, request) {
      const old = request ? await idOf(request) : null
      if (old) sessions.delete(old)
      if (value === null) return `${name}=${attributes}; Max-Age=0`
      return `${await create(value)}${attributes}; Max-Age=${maxAge}`
    },
    issue: create,
  }
}

export function signedCookie({
  name,
  secret,
  maxAge,
  secure = true,
}: {
  name: string
  secret: string
  maxAge: number
  secure?: boolean
}) {
  const attributes = `; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  const { sign, verify } = signer(secret)
  return {
    async read(request: Request): Promise<unknown> {
      const [payload, signature] = cookieValue(request, name)?.split('.') ?? []
      if (!payload || !signature || !(await verify(payload, signature))) return null
      try {
        return JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
      } catch {
        return null
      }
    },
    async write(value: unknown): Promise<string> {
      if (value === null) return `${name}=${attributes}; Max-Age=0`
      const payload = base64url(encoder.encode(JSON.stringify(value)))
      return `${name}=${payload}.${await sign(payload)}${attributes}; Max-Age=${maxAge}`
    },
  }
}
