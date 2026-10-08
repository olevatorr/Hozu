import type { Snapshot } from '@hozu/machine'

/** The hidden field a natively rendered form carries its machine's state in (ADR 0070 B1). */
export const STATE_FIELD = '__hozu_state'

const encoder = new TextEncoder()
const MAX = 16_000
let fallback = ''
const keys = new Map<string, ReturnType<typeof crypto.subtle.importKey>>()

const keyOf = (secret: string | undefined) => {
  fallback ||= `${crypto.randomUUID()}${crypto.randomUUID()}`
  const raw = secret || fallback
  let key = keys.get(raw)
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ])
    keys.set(raw, key)
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

/** A machine snapshot signed for one feature, or null when it is too large to carry in a form. */
export async function seal(
  secret: string | undefined,
  feature: string,
  snapshot: Snapshot,
): Promise<string | null> {
  const body = base64url(encoder.encode(JSON.stringify({ f: feature, s: snapshot })))
  if (body.length > MAX) return null
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await keyOf(secret), encoder.encode(body)),
  )
  return `${body}.${base64url(signature)}`
}

/** The snapshot a form posted back, if its signature holds and it belongs to this feature. */
export async function unseal(
  secret: string | undefined,
  feature: string,
  token: string | undefined,
): Promise<Snapshot | null> {
  if (!token || token.length > MAX + 100) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await keyOf(secret),
      bytesOf(signature),
      encoder.encode(body),
    )
    if (!ok) return null
    const value = JSON.parse(new TextDecoder().decode(bytesOf(body))) as { f?: string; s?: Snapshot }
    return value.f === feature && value.s && typeof value.s.state === 'string' ? value.s : null
  } catch {
    return null
  }
}
