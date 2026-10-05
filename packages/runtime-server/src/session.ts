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

/** The key-value interface `kvSessions` stores sessions in; Cloudflare KV has this shape. */
export interface SessionKV {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface KvSessionsOptions extends Omit<MemorySessionsOptions, 'secret' | 'now'> {
  secret: string
  prefix?: string
}

function storedSessions(
  kv: SessionKV,
  { name, secret, maxAge, secure, prefix }: Required<KvSessionsOptions>,
  label: string,
): SessionStore {
  if (secret.length < 32) throw new Error(`${label} secret must be at least 32 characters`)
  const attributes = `; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  const { sign, verify } = signer(secret)
  const idOf = async (request: Request) => {
    const [id, signature] = cookieValue(request, name)?.split('.') ?? []
    return id && signature && (await verify(id, signature)) ? id : null
  }
  const create = async (value: unknown) => {
    const id = random(18)
    await kv.put(`${prefix}${id}`, JSON.stringify(value), { expirationTtl: maxAge })
    return `${name}=${id}.${await sign(id)}`
  }
  return {
    async read(request) {
      const id = await idOf(request)
      const json = id ? await kv.get(`${prefix}${id}`) : null
      try {
        return json === null ? null : JSON.parse(json)
      } catch {
        return null
      }
    },
    async write(value, request) {
      const old = request ? await idOf(request) : null
      if (old) await kv.delete(`${prefix}${old}`)
      if (value === null) return `${name}=${attributes}; Max-Age=0`
      return `${await create(value)}${attributes}; Max-Age=${maxAge}`
    },
    issue: create,
  }
}

function memoryKV(now: () => number): SessionKV {
  const sessions = new Map<string, { json: string; expires: number }>()
  return {
    async get(key) {
      const s = sessions.get(key)
      if (!s) return null
      if (s.expires > now()) return s.json
      sessions.delete(key)
      return null
    },
    async put(key, json, { expirationTtl }) {
      const at = now()
      if (sessions.size > 1000) for (const [k, s] of sessions) if (s.expires <= at) sessions.delete(k)
      sessions.set(key, { json, expires: at + expirationTtl * 1000 })
    },
    async delete(key) {
      sessions.delete(key)
    },
  }
}

export function memorySessions({
  name = 'sid',
  secret,
  maxAge = 60 * 60 * 24 * 30,
  secure = true,
  now = Date.now,
}: MemorySessionsOptions = {}): SessionStore {
  return storedSessions(
    memoryKV(now),
    { name, secret: secret ?? random(32), maxAge, secure, prefix: '' },
    'memorySessions',
  )
}

/**
 * Sessions in a shared key-value store, for several instances or an edge runtime (ADR 0059 I): the cookie holds an
 * opaque signed id, the value lives in `kv` under `prefix + id` and is deleted on sign-out, as with memorySessions.
 * Cloudflare KV keeps a value at least 60 seconds, so a shorter `maxAge` ends with the cookie, not the stored value.
 */
export function kvSessions(
  kv: SessionKV,
  { name = 'sid', secret, maxAge = 60 * 60 * 24 * 30, secure = true, prefix = 'session:' }: KvSessionsOptions,
): SessionStore {
  const store: SessionKV = {
    get: (key) => kv.get(key),
    put: (key, value, { expirationTtl }) =>
      kv.put(key, value, { expirationTtl: Math.max(60, expirationTtl) }),
    delete: (key) => kv.delete(key),
  }
  return storedSessions(store, { name, secret, maxAge, secure, prefix }, 'kvSessions')
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
