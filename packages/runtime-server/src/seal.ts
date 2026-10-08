import type { Snapshot } from '@hozu/machine'

/** The hidden field a natively rendered form carries its machine's state in (ADR 0070 B1). */
export const STATE_FIELD = '__hozu_state'

const encoder = new TextEncoder()
const MAX = 16_000
const DAY = 86_400_000
const keys = new Map<string, ReturnType<typeof crypto.subtle.importKey>>()

const keyOf = (secret: string) => {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ])
    keys.set(secret, key)
  }
  return key
}

const base64url = (bytes: Uint8Array) => {
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const bytesOf = (text: string) => {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const signed = (body: string) => encoder.encode(`hozu-state\n${body}`)

/**
 * A machine snapshot for one feature, bound to the machine's shape and the visitor's session (`bind`) and to a day.
 * Signed with the server's secret when it has one; without one the token is plain and only checked, which is no weaker
 * than JavaScript (the browser sends its own events and payloads, and every effect checks access on the server).
 * Null when it is too large to carry in a form.
 */
export async function seal(
  secret: string | undefined,
  feature: string,
  bind: string,
  snapshot: Snapshot,
): Promise<string | null> {
  const body = base64url(encoder.encode(JSON.stringify({ f: feature, b: bind, t: Date.now(), s: snapshot })))
  if (body.length > MAX) return null
  if (!secret) return `${body}.`
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await keyOf(secret), signed(body)))
  return `${body}.${base64url(signature)}`
}

/** The snapshot a form posted back: this feature's, this machine's and session's, recent, signed when the server signs. */
export async function unseal(
  secret: string | undefined,
  feature: string,
  bind: string,
  token: string | undefined,
): Promise<Snapshot | null> {
  if (!token || token.length > MAX + 100) return null
  const [body, signature = ''] = token.split('.')
  if (!body) return null
  try {
    if (secret) {
      if (!signature) return null
      if (!(await crypto.subtle.verify('HMAC', await keyOf(secret), bytesOf(signature), signed(body))))
        return null
    } else if (signature) return null
    const value = JSON.parse(new TextDecoder().decode(bytesOf(body))) as {
      f?: string
      b?: string
      t?: number
      s?: Snapshot
    }
    const fresh = typeof value.t === 'number' && Date.now() - value.t < DAY
    return value.f === feature && value.b === bind && fresh && value.s && typeof value.s.state === 'string'
      ? value.s
      : null
  } catch {
    return null
  }
}
